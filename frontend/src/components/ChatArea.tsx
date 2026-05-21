import { useEffect, useRef, useState } from 'react';
import type { ClaudeState, PermissionDecision } from '@mobileai/shared';
import type { TimelineItem } from '../lib/timeline';
import { ItemView } from './items';

interface Props {
  items: TimelineItem[];
  status: ClaudeState | null;
  /** True while a session switch is loading — shows a spinner, not stale items. */
  switching: boolean;
  onDecide: (id: string, decision: PermissionDecision) => void;
}

/** Distance from the bottom (px) that still counts as "stuck to the bottom". */
const BOTTOM_THRESHOLD = 80;

/** Scrollable conversation view; sticks to the bottom unless the user scrolls up. */
export function ChatArea({ items, status, switching, onDecide }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Auto-scroll on new content only when the user hasn't scrolled up to read.
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ block: 'end' });
  }, [items, status, atBottom]);

  // A session switch should always land the user at the foot of the history.
  useEffect(() => {
    if (switching) setAtBottom(true);
  }, [switching]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < BOTTOM_THRESHOLD);
  };

  // Re-engage auto-follow rather than firing a one-shot scroll: while a session
  // streams, content grows faster than a single scroll can chase, so the only
  // reliable "back to bottom" is to flip atBottom and let the effect re-pin.
  const jumpToBottom = (): void => setAtBottom(true);

  const busy = status === 'busy';
  const lastIsAssistant = items[items.length - 1]?.kind === 'assistant';

  return (
    <div className="chat-wrap">
      <div className="chat-area" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner">
          {switching ? (
            <div className="chat-loading">
              <span className="spinner" />
              <span className="chat-loading-text">载入会话…</span>
            </div>
          ) : items.length === 0 && !busy ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <h3>有什么可以帮你的？</h3>
              <p>给服务器上的 Claude Code 会话发消息，随时随地查看运行状态与结果。</p>
            </div>
          ) : (
            items.map((item) => <ItemView key={item.id} item={item} onDecide={onDecide} />)
          )}
          {!switching && busy && !lastIsAssistant && (
            <div className="thinking">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {!atBottom && !switching && (
        <button
          type="button"
          className="scroll-bottom"
          onClick={jumpToBottom}
          aria-label="回到底部"
          title="回到底部"
        >
          ↓
        </button>
      )}
    </div>
  );
}
