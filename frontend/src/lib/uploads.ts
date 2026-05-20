import { loadToken } from './storage';

export interface UploadedFile {
  path: string;
  name: string;
  size: number;
  mime: string;
}

/** Send a batch of files to the bridge, scoped to the active session's cwd. */
export async function uploadFiles(sessionId: string, files: File[]): Promise<UploadedFile[]> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  if (files.length === 0) return [];
  const form = new FormData();
  for (const f of files) form.append('files', f);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-auth-token': token, 'x-session-id': sessionId },
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.files as UploadedFile[];
}

/** Pretty-print a file size for the attachment chip. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}
