import { useEffect, useRef } from 'react';
import type { ClaudeState, PermissionDecision } from '@mobileai/shared';
import type { TimelineItem } from '../lib/timeline';
import { ItemView } from './items';

interface Props {
  items: TimelineItem[];
  status: ClaudeState | null;
  onDecide: (id: string, decision: PermissionDecision) => void;
}

/** Scrollable conversation view; sticks to the bottom as new items arrive. */
export function ChatArea({ items, status, onDecide }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items, status]);

  const busy = status === 'busy';
  const lastIsAssistant = items[items.length - 1]?.kind === 'assistant';

  return (
    <div className="chat-area">
      <div className="chat-inner">
        {items.length === 0 && !busy ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <h3>有什么可以帮你的？</h3>
            <p>给服务器上的 Claude Code 会话发消息，随时随地查看运行状态与结果。</p>
          </div>
        ) : (
          items.map((item) => <ItemView key={item.id} item={item} onDecide={onDecide} />)
        )}
        {busy && !lastIsAssistant && (
          <div className="thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
