import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEntry, ServerMessage } from '@mobileai/shared';

/**
 * The Claude Code CLI persists each chat as a JSONL file under
 * `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. The cwd is encoded by
 * replacing every non-alphanumeric character with `-`, so both
 * `/home/alice/all_papers` and `/home/alice/all.papers` map to
 * `-home-alice-all-papers`.
 */
const ROOT = join(homedir(), '.claude', 'projects');

/** Where we record terminal sessions the user chose to hide (not delete). */
const HIDDEN_FILE = join(homedir(), '.claude-bridge', 'hidden-cli.json');

/**
 * Session ids are UUIDs. Validate before touching the filesystem so a crafted
 * id can never escape the projects directory (path traversal).
 */
function isValidSessionId(id: string): boolean {
  return /^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/.test(id) && !id.includes('..');
}

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(HIDDEN_FILE, 'utf8')) as string[]);
  } catch {
    return new Set();
  }
}

function saveHidden(ids: Set<string>): void {
  mkdirSync(join(homedir(), '.claude-bridge'), { recursive: true });
  writeFileSync(HIDDEN_FILE, JSON.stringify([...ids]));
}

/** Hide a terminal session from the picker without touching its transcript. */
export function hideCliSession(sessionId: string): void {
  if (!isValidSessionId(sessionId)) throw new Error('invalid session id');
  const hidden = loadHidden();
  hidden.add(sessionId);
  saveHidden(hidden);
}

/**
 * Permanently delete a terminal session's transcript from ~/.claude/projects.
 * This is irreversible — the conversation is gone from `claude --resume` too.
 */
export function deleteCliSession(cwd: string, sessionId: string): void {
  if (!isValidSessionId(sessionId)) throw new Error('invalid session id');
  unlinkSync(join(ROOT, encodeCwd(cwd), `${sessionId}.jsonl`));
}

export interface CliSessionMeta {
  sessionId: string;
  title: string;
  lastActiveAt: number;
  /** Approximate count of meaningful turns (user + assistant). */
  messages: number;
}

/** Map an absolute cwd to the encoded directory name Claude CLI uses. */
function encodeCwd(cwd: string): string {
  // Claude CLI replaces every non-alphanumeric char (/, _, ., space …) with '-'.
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/** List terminal-Claude sessions that were recorded inside `cwd`. */
export function listCliSessions(cwd: string): CliSessionMeta[] {
  const dir = join(ROOT, encodeCwd(cwd));
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const hidden = loadHidden();
  const out: CliSessionMeta[] = [];
  for (const file of entries) {
    const id = file.replace(/\.jsonl$/, '');
    // Skip subagent transcripts — they belong to a parent session.
    if (id.startsWith('agent-')) continue;
    // Skip sessions the user explicitly hid.
    if (hidden.has(id)) continue;
    try {
      const path = join(dir, file);
      const stat = statSync(path);
      if (stat.size === 0) continue;
      const meta = summarize(path, id);
      meta.lastActiveAt = stat.mtimeMs;
      out.push(meta);
    } catch {
      /* skip unreadable file */
    }
  }
  return out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

function summarize(path: string, sessionId: string): CliSessionMeta {
  // Three title candidates, in descending preference:
  //   clean — real user input (not a Claude Code system wrapper)
  //   cmd   — a slash-command turn, shown as "命令 /foo"
  //   any   — anything else, tags stripped
  let clean = '';
  let cmd = '';
  let any = '';
  let messages = 0;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'user' || event.type === 'assistant') {
      messages += 1;
      if (event.type === 'user' && !clean) {
        const raw = firstText(event.message?.content);
        const t = raw ? raw.replace(/\s+/g, ' ').trim() : '';
        if (t && !t.startsWith('<')) {
          clean = t;
        } else if (t) {
          const m = t.match(/<command-name>([^<]+)<\/command-name>/);
          if (m && !cmd) cmd = `命令 ${m[1].trim()}`;
          if (!any) any = stripTags(t);
        }
      }
    }
  }
  const chosen = clean || cmd || any || '(无标题)';
  return { sessionId, title: chosen.slice(0, 60), lastActiveAt: 0, messages };
}

/**
 * Parse the JSONL transcript into our wire-format history so the bridge UI
 * can show the prior conversation when the user resumes it.
 */
export function loadCliHistory(cwd: string, sessionId: string): HistoryEntry[] {
  const path = join(ROOT, encodeCwd(cwd), `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }

  const out: HistoryEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(event.timestamp ?? '') || Date.now();
    if (event.type === 'user') {
      const content = event.message?.content;
      if (typeof content === 'string') {
        out.push({ at, msg: { type: 'user_echo', text: content } });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_result') {
            out.push({
              at,
              msg: {
                type: 'tool_result',
                id: String(block.tool_use_id ?? ''),
                content: block.content,
                isError: Boolean(block.is_error),
              },
            });
          } else if (block?.type === 'text' && typeof block.text === 'string') {
            out.push({ at, msg: { type: 'user_echo', text: block.text } });
          }
        }
      }
    } else if (event.type === 'assistant') {
      for (const block of asArray(event.message?.content)) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          out.push({ at, msg: { type: 'assistant', text: block.text } });
        } else if (block?.type === 'tool_use') {
          out.push({
            at,
            msg: {
              type: 'tool_use',
              id: String(block.id ?? ''),
              name: String(block.name ?? ''),
              input: block.input,
            },
          });
        }
      }
    }
  }
  return out;
}

/** Strip XML-ish wrappers Claude Code injects, leaving whatever plain text remains. */
function stripTags(text: string): string {
  const s = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || text;
}

function firstText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
    }
  }
  return null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

