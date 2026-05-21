import { useEffect, useState } from 'react';
import { IconGear } from './icons';

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

const STORAGE_KEY = 'bridge_quick_actions';
const DEFAULTS = [
  'git status',
  '/diff',
  '总结一下本次会话做了什么',
  '继续刚才的工作',
];

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to defaults */
  }
  return DEFAULTS;
}

function save(actions: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  } catch {
    /* private mode */
  }
}

/**
 * Chip row above the composer for one-tap prompts. Customisable per-device
 * via localStorage — useful on mobile where typing long commands is painful.
 */
export function QuickActions({ disabled, onSend }: Props) {
  const [actions, setActions] = useState<string[]>(load);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    save(actions);
  }, [actions]);

  const remove = (idx: number): void => setActions((a) => a.filter((_, i) => i !== idx));
  const add = (): void => {
    const value = draft.trim();
    if (!value) return;
    setActions((a) => [...a, value]);
    setDraft('');
  };

  return (
    <div className="quick-actions">
      <div className="quick-actions-row">
        {actions.map((text, i) => (
          <span key={`${text}-${i}`} className={`chip ${editing ? 'editing' : ''}`}>
            <button
              type="button"
              className="chip-body"
              disabled={disabled}
              onClick={() => !editing && onSend(text)}
              title={text}
            >
              {text}
            </button>
            {editing && (
              <button
                type="button"
                className="chip-del"
                aria-label="删除"
                onClick={() => remove(i)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          className="chip chip-toggle"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? '完成编辑' : '编辑快捷指令'}
        >
          {editing ? '完成' : <IconGear size={13} />}
        </button>
      </div>
      {editing && (
        <div className="quick-actions-add">
          <input
            value={draft}
            placeholder="新增一条快捷指令…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} disabled={!draft.trim()}>
            添加
          </button>
        </div>
      )}
    </div>
  );
}
