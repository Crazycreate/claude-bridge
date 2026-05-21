import type { PermissionDecision } from '@mobileai/shared';
import type { TimelineItem } from '../lib/timeline';
import { renderMarkdown } from '../lib/markdown';
import { MarkdownBody } from './CodeBlocks';
import { IconLock, IconTool } from './icons';

/** Pretty-print arbitrary tool input/output for the monospace panes. */
function fmt(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function UserItem({ text }: { text: string }) {
  return (
    <div className="message user">
      <div className="avatar user">U</div>
      <div className="bubble">{text}</div>
    </div>
  );
}

function AssistantItem({ text }: { text: string }) {
  return (
    <div className="message claude">
      <div className="avatar claude">C</div>
      <MarkdownBody html={renderMarkdown(text)} />
    </div>
  );
}

function ToolItem({ name, input, result }: Extract<TimelineItem, { kind: 'tool' }>) {
  const badge = !result
    ? { cls: '', label: 'running' }
    : result.isError
      ? { cls: 'err', label: 'error' }
      : { cls: 'ok', label: 'done' };

  return (
    <details className="tool-card">
      <summary>
        <IconTool size={14} />
        <span className="tool-name">{name}</span>
        <span className={`tool-badge ${badge.cls}`}>{badge.label}</span>
      </summary>
      <div className="code-label">input</div>
      <pre className="code">{fmt(input)}</pre>
      {result && (
        <>
          <div className="code-label">output</div>
          <pre className={`code ${result.isError ? 'err' : ''}`}>{fmt(result.content)}</pre>
        </>
      )}
    </details>
  );
}

function PermissionItem({
  item,
  onDecide,
}: {
  item: Extract<TimelineItem, { kind: 'permission' }>;
  onDecide: (id: string, decision: PermissionDecision) => void;
}) {
  return (
    <div className="perm">
      <div className="perm-head">
        <IconLock size={14} /> <span>Allow</span> <b>{item.toolName}</b>?
      </div>
      <pre className="code">{fmt(item.input)}</pre>
      {item.decision ? (
        <div className={`perm-resolved ${item.decision}`}>
          {item.decision === 'allow' ? '✓ Allowed' : '✕ Denied'}
        </div>
      ) : (
        <div className="perm-actions">
          <button className="allow" onClick={() => onDecide(item.id, 'allow')}>
            Allow
          </button>
          <button className="deny" onClick={() => onDecide(item.id, 'deny')}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

function ResultItem({ subtype, durationMs, isError, costUsd }: Extract<TimelineItem, { kind: 'result' }>) {
  const cost = costUsd > 0 ? ` · $${costUsd.toFixed(4)}` : '';
  return (
    <div className={`divider ${isError ? 'err' : ''}`}>
      turn {subtype} · {(durationMs / 1000).toFixed(1)}s{cost}
    </div>
  );
}

/** Render one timeline entry in the chat flow. */
export function ItemView({
  item,
  onDecide,
}: {
  item: TimelineItem;
  onDecide: (id: string, decision: PermissionDecision) => void;
}) {
  switch (item.kind) {
    case 'user':
      return <UserItem text={item.text} />;
    case 'assistant':
      return <AssistantItem text={item.text} />;
    case 'tool':
      return (
        <div className="flow">
          <ToolItem {...item} />
        </div>
      );
    case 'permission':
      return (
        <div className="flow">
          <PermissionItem item={item} onDecide={onDecide} />
        </div>
      );
    case 'result':
      return (
        <div className="flow">
          <ResultItem {...item} />
        </div>
      );
    case 'error':
      return (
        <div className="flow">
          <div className="error-line">{item.message}</div>
        </div>
      );
  }
}
