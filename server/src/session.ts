import { randomUUID } from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  ClaudeState,
  HistoryEntry,
  PermissionDecision,
  ServerMessage,
  SessionMeta,
} from '@mobileai/shared';

const HISTORY_LIMIT = 500;
const DEFAULT_TITLE = 'New chat';

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

interface SessionOptions {
  id: string;
  cwd: string;
  permissionMode: PermissionMode;
  /** Called whenever the session's sidebar metadata (title/state) changes. */
  onMeta: () => void;
  /** Called whenever the history grows so callers can persist it. */
  onHistory: () => void;
  /** Called for each *new* message (not history replays); for push, audit, etc. */
  onEmit?: (msg: ServerMessage) => void;
  /** Snapshot used to revive sessions loaded from disk. */
  initial?: {
    title?: string;
    createdAt?: number;
    claudeSessionId?: string | null;
    history?: HistoryEntry[];
    model?: string;
  };
}

type Listener = (msg: ServerMessage) => void;

/** A pending tool-permission request awaiting an approve/deny from a client. */
interface PendingPermission {
  input: Record<string, unknown>;
  resolve: (result: unknown) => void;
}

/**
 * Owns a single long-lived Claude Code session via the Agent SDK.
 * The session is dormant until `start()` is called: this lets us list
 * persisted sessions in the sidebar without spawning a Claude process per
 * row at boot time.
 */
export class ClaudeSession {
  readonly id: string;
  readonly createdAt: number;
  title: string;
  state: ClaudeState = 'dormant';
  /** Claude's own session id; used to resume a previous conversation. */
  claudeSessionId: string | null = null;
  /** Anthropic model id; empty string means "use the SDK default". */
  model: string;

  private readonly listeners = new Set<Listener>();
  private readonly history: HistoryEntry[] = [];
  private readonly pendingPermissions = new Map<string, PendingPermission>();

  /** Queue of user prompts not yet pulled by the SDK input generator. */
  private readonly inputQueue: string[] = [];
  /** Resolver waiting for the next prompt when the queue is empty. */
  private inputWaiter: ((text: string | null) => void) | null = null;

  private response: (AsyncGenerator<unknown> & { interrupt?: () => Promise<void> }) | null = null;
  private closed = false;
  /** True while we are intentionally tearing down the SDK to restart it. */
  private restarting = false;

  constructor(private readonly opts: SessionOptions) {
    this.id = opts.id;
    this.createdAt = opts.initial?.createdAt ?? Date.now();
    this.title = opts.initial?.title ?? DEFAULT_TITLE;
    this.claudeSessionId = opts.initial?.claudeSessionId ?? null;
    this.model = opts.initial?.model ?? '';
    if (opts.initial?.history) this.history.push(...opts.initial.history);
  }

  meta(): SessionMeta {
    return {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      state: this.state,
      cwd: this.opts.cwd,
      model: this.model,
    };
  }

  /** Snapshot for persistence — meta + full message history. */
  snapshot(): {
    id: string;
    title: string;
    createdAt: number;
    cwd: string;
    claudeSessionId: string | null;
    history: HistoryEntry[];
    model: string;
  } {
    return {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      cwd: this.opts.cwd,
      claudeSessionId: this.claudeSessionId,
      history: this.history.slice(),
      model: this.model,
    };
  }

  /**
   * Boot the Claude Code SDK process. Idempotent: if already started, does
   * nothing. When `claudeSessionId` is set, the prior conversation is resumed.
   */
  start(): void {
    if (this.response || this.closed) return;
    this.setState('starting');
    const response = query({
      prompt: this.inputStream(),
      options: this.queryOptions(),
    }) as NonNullable<typeof this.response>;
    this.response = response;
    void this.consume(response);
  }

  /** Build the SDK options bag from this session's current settings. */
  private queryOptions(): Record<string, unknown> {
    return {
      cwd: this.opts.cwd,
      permissionMode: this.opts.permissionMode,
      canUseTool: this.canUseTool.bind(this),
      ...(this.claudeSessionId ? { resume: this.claudeSessionId } : {}),
      ...(this.model ? { model: this.model } : {}),
    };
  }

  /**
   * Switch the model this session uses, resuming the same Claude conversation
   * on the new model. Safe to call whether the session is dormant, idle, or
   * mid-turn — though we won't interrupt an in-flight turn just for this.
   */
  async setModel(model: string): Promise<void> {
    if (this.closed || model === this.model) return;
    this.model = model;
    this.opts.onMeta();
    this.opts.onHistory();
    // Dormant session: just update the field; next start() picks it up.
    if (!this.response) return;
    await this.restartSdk();
    this.emit({ type: 'assistant', text: `✨ 已切换到 \`${model || '默认模型'}\`,继续之前的对话。` });
  }

  /** Tear down the current SDK query and start a fresh one (used by setModel). */
  private async restartSdk(): Promise<void> {
    const old = this.response;
    if (!old) return;
    this.restarting = true;
    // Unblock the input generator so it can return cleanly.
    const waiter = this.inputWaiter;
    this.inputWaiter = null;
    waiter?.(null);
    try {
      await old.return?.(undefined as never);
    } catch {
      /* generator close may throw; we don't care */
    }
    this.response = null;
    this.restarting = false;
    this.start();
  }

  /** Subscribe a client; replays recent history, returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void {
    for (const entry of this.history) listener(entry.msg);
    listener({ type: 'status', state: this.state });
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Send a new user prompt into the running session. */
  sendPrompt(text: string): void {
    if (this.closed || !text.trim()) return;
    // Auto-start if the user is talking to a dormant historical session.
    if (!this.response) this.start();
    if (this.title === DEFAULT_TITLE) {
      this.title = text.trim().slice(0, 40);
      this.opts.onMeta();
    }
    this.emit({ type: 'user_echo', text });
    this.setState('busy');
    if (this.inputWaiter) {
      const waiter = this.inputWaiter;
      this.inputWaiter = null;
      waiter(text);
    } else {
      this.inputQueue.push(text);
    }
  }

  rename(title: string): void {
    const next = title.trim();
    if (!next || next === this.title) return;
    this.title = next.slice(0, 60);
    this.opts.onMeta();
    this.opts.onHistory();
  }

  /** Resolve a permission request raised by canUseTool. */
  resolvePermission(id: string, decision: PermissionDecision): void {
    const pending = this.pendingPermissions.get(id);
    if (!pending) return;
    this.pendingPermissions.delete(id);
    if (decision === 'allow') {
      pending.resolve({ behavior: 'allow', updatedInput: pending.input });
    } else {
      pending.resolve({ behavior: 'deny', message: 'Denied by user from mobile client.' });
    }
    this.emit({ type: 'permission_resolved', id, decision });
  }

  /** Interrupt the current turn (Claude stops what it is doing). */
  async interrupt(): Promise<void> {
    if (!this.response) return;
    try {
      await this.response.interrupt?.();
    } catch (err) {
      this.emit({ type: 'error', message: `interrupt failed: ${String(err)}` });
    }
  }

  /** Shut the session down permanently. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.inputWaiter) {
      const waiter = this.inputWaiter;
      this.inputWaiter = null;
      waiter(null);
    }
  }

  // --- internals -----------------------------------------------------------

  /** Async generator feeding prompts to the SDK; stays open for the session's life. */
  private async *inputStream(): AsyncGenerator<Record<string, unknown>> {
    while (!this.closed) {
      const text =
        this.inputQueue.length > 0
          ? this.inputQueue.shift()!
          : await new Promise<string | null>((resolve) => {
              this.inputWaiter = resolve;
            });
      if (text === null) return;
      yield {
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: this.claudeSessionId ?? '',
      };
    }
  }

  /**
   * Drain the SDK output stream and translate each message for clients.
   * Captures the generation it was started for so it stays inert if a
   * `setModel` swap replaces the response with a fresher one.
   */
  private async consume(response: NonNullable<typeof this.response>): Promise<void> {
    try {
      for await (const message of response) {
        if (this.response !== response) return;
        this.handleSdkMessage(message as Record<string, any>);
      }
    } catch (err) {
      if (!this.closed && !this.restarting && this.response === response) {
        this.emit({ type: 'error', message: String(err) });
      }
    } finally {
      if (!this.restarting && this.response === response) this.setState('idle');
    }
  }

  private handleSdkMessage(m: Record<string, any>): void {
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init' && typeof m.session_id === 'string') {
          // After a `resume`, Claude assigns a new session_id — track it so
          // the next restart can resume from this turn rather than the original.
          this.claudeSessionId = m.session_id;
          this.setState('ready');
          this.opts.onHistory();
        }
        return;
      case 'assistant':
        for (const block of m.message?.content ?? []) {
          if (block.type === 'text') {
            this.emit({ type: 'assistant', text: block.text });
          } else if (block.type === 'tool_use') {
            this.emit({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
          }
        }
        return;
      case 'user':
        for (const block of asArray(m.message?.content)) {
          if (block?.type === 'tool_result') {
            this.emit({
              type: 'tool_result',
              id: block.tool_use_id,
              content: block.content,
              isError: Boolean(block.is_error),
            });
          }
        }
        return;
      case 'result':
        this.emit({
          type: 'result',
          subtype: String(m.subtype ?? 'unknown'),
          durationMs: Number(m.duration_ms ?? 0),
          isError: Boolean(m.is_error),
          costUsd: Number(m.total_cost_usd ?? 0),
        });
        this.setState('idle');
        return;
      default:
        return;
    }
  }

  /** Called by the SDK when a tool needs permission; surfaced to the client. */
  private canUseTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    this.emit({ type: 'permission_request', id, toolName, input });
    return new Promise((resolve) => {
      this.pendingPermissions.set(id, { input, resolve });
    });
  }

  private setState(state: ClaudeState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({
      type: 'status',
      state,
      ...(this.claudeSessionId ? { claudeSessionId: this.claudeSessionId } : {}),
    });
    this.opts.onMeta();
  }

  private emit(msg: ServerMessage): void {
    this.history.push({ at: Date.now(), msg });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch {
        /* a dead listener must not break the others */
      }
    }
    this.opts.onHistory();
    try {
      this.opts.onEmit?.(msg);
    } catch {
      /* onEmit must not break the session */
    }
  }
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}
