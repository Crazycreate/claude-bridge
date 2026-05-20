import type { ServerMessage } from '@mobileai/shared';

/** A renderable entry in the conversation timeline. */
export type TimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: unknown; result?: ToolResult }
  | { kind: 'permission'; id: string; toolName: string; input: unknown; decision?: 'allow' | 'deny' }
  | {
      kind: 'result';
      id: string;
      subtype: string;
      durationMs: number;
      isError: boolean;
      costUsd: number;
    }
  | { kind: 'error'; id: string; message: string };

export interface ToolResult {
  content: unknown;
  isError: boolean;
}

function rid(): string {
  return crypto.randomUUID();
}

/**
 * Fold one server message into the timeline, returning a new array.
 * Connection-level messages (auth/status) are handled by the hook, not here.
 */
export function applyServerMessage(items: TimelineItem[], msg: ServerMessage): TimelineItem[] {
  switch (msg.type) {
    case 'user_echo':
      return [...items, { kind: 'user', id: rid(), text: msg.text }];

    case 'assistant':
      return [...items, { kind: 'assistant', id: rid(), text: msg.text }];

    case 'tool_use':
      return [...items, { kind: 'tool', id: msg.id, name: msg.name, input: msg.input }];

    case 'tool_result':
      return items.map((it) =>
        it.kind === 'tool' && it.id === msg.id
          ? { ...it, result: { content: msg.content, isError: msg.isError } }
          : it,
      );

    case 'permission_request':
      return [
        ...items,
        { kind: 'permission', id: msg.id, toolName: msg.toolName, input: msg.input },
      ];

    case 'permission_resolved':
      return items.map((it) =>
        it.kind === 'permission' && it.id === msg.id ? { ...it, decision: msg.decision } : it,
      );

    case 'result':
      return [
        ...items,
        {
          kind: 'result',
          id: rid(),
          subtype: msg.subtype,
          durationMs: msg.durationMs,
          isError: msg.isError,
          costUsd: msg.costUsd,
        },
      ];

    case 'error':
      return [...items, { kind: 'error', id: rid(), message: msg.message }];

    default:
      return items;
  }
}
