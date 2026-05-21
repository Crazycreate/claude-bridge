import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { formatSize, isImage, uploadFiles, type UploadedFile } from '../lib/uploads';
import { IconFile } from './icons';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  /** The currently-selected session id — uploads land in its working directory. */
  sessionId: string | null;
}

/** A single attachment that has finished uploading (object url is for preview only). */
interface Attachment extends UploadedFile {
  /** Local-only blob URL for image previews; freed on send/remove. */
  previewUrl?: string;
}

/**
 * Composer with attachment support: file picker, drag-drop, and clipboard paste.
 * Files upload to the session's `<cwd>/.bridge-uploads/`; on send the
 * absolute paths are appended to the prompt so Claude can `Read` them.
 */
export function Composer({ onSend, disabled, sessionId }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs when component unmounts so we don't leak blobs.
  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grow = (): void => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleFiles = async (incoming: File[]): Promise<void> => {
    if (!sessionId) {
      setError('请先选择一个会话');
      return;
    }
    if (incoming.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const previews = new Map<string, string>();
      for (const f of incoming) {
        if (f.type.startsWith('image/')) previews.set(f.name, URL.createObjectURL(f));
      }
      const uploaded = await uploadFiles(sessionId, incoming);
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((u) => ({ ...u, previewUrl: previews.get(u.name) })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (path: string): void => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.path === path);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.path !== path);
    });
  };

  const submit = (): void => {
    const value = text.trim();
    if (disabled) return;
    if (!value && attachments.length === 0) return;

    let prompt = value;
    if (attachments.length > 0) {
      const lines = attachments
        .map((a) => `- ${a.path}${a.mime ? ` (${a.mime})` : ''}`)
        .join('\n');
      prompt = value
        ? `${value}\n\n[已上传文件]\n${lines}`
        : `请查看我刚上传的文件:\n${lines}`;
    }

    onSend(prompt);
    setText('');
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void handleFiles(files);
  };

  const onPickerChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    void handleFiles(files);
    e.target.value = ''; // allow picking the same file again later
  };

  return (
    <div
      className={`input-area ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((a) => (
            <div key={a.path} className="attachment">
              {isImage(a.mime) && a.previewUrl ? (
                <img src={a.previewUrl} alt={a.name} />
              ) : (
                <span className="attachment-icon">
                  <IconFile size={16} />
                </span>
              )}
              <div className="attachment-meta">
                <div className="attachment-name" title={a.path}>
                  {a.name}
                </div>
                <div className="attachment-size">{formatSize(a.size)}</div>
              </div>
              <button
                type="button"
                className="attachment-remove"
                aria-label="移除附件"
                onClick={() => removeAttachment(a.path)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="composer-error">{error}</div>}

      <div className="input-box">
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="添加附件"
          title="附件:图片、PDF、log 等"
        >
          {uploading ? '⋯' : '＋'}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf,text/*,.log,.json,.md,.csv"
          onChange={onPickerChange}
        />
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder={disabled ? '重新连接中…' : '输入消息…可拖拽或粘贴文件'}
          onChange={(e) => {
            setText(e.target.value);
            grow();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <button
          className="send-btn"
          onClick={submit}
          disabled={disabled || (!text.trim() && attachments.length === 0)}
          aria-label="发送"
        >
          ↑
        </button>
      </div>
      <div className="input-hint">Enter 发送 · Shift+Enter 换行 · 支持拖拽/粘贴图片</div>
    </div>
  );
}
