import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';
import express from 'express';
import multer from 'multer';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@mobileai/shared';
import { config } from './config.js';
import { SessionManager } from './manager.js';
import {
  deleteCliSession,
  hideCliSession,
  listCliSessions,
  loadCliHistory,
} from './cli-history.js';
import { gitStatus } from './git-status.js';
import { push } from './push.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const distDir = join(here, '..', '..', 'frontend', 'dist');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Serve the React production build when present; fall back to the legacy
// in-server test page so `npm start` still works before a build has been done.
const webRoot = existsSync(join(distDir, 'index.html')) ? distDir : publicDir;
app.use(express.static(webRoot));

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: manager.list().length });
});

/**
 * Token-protected directory listing. Used by the new-session dialog so the
 * user can browse the server's filesystem without an SSH session.
 * Only subdirectories are returned (this picker chooses a working directory).
 */
/**
 * Token-protected list of Claude CLI (terminal) sessions captured under a
 * given working directory. Used by the new-session dialog so the user can
 * resume a conversation they previously held in a terminal.
 */
app.get('/api/cli-sessions', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : '';
  if (!cwd) {
    res.status(400).json({ error: 'cwd is required' });
    return;
  }
  try {
    const abs = resolveWorkingDir(cwd);
    res.json({ cwd: abs, sessions: listCliSessions(abs) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

/** Hide a terminal session from the picker (transcript stays on disk). */
app.post('/api/cli-sessions/hide', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const sessionId = (req.body as { sessionId?: string })?.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  try {
    hideCliSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Permanently delete a terminal session's transcript. Irreversible. */
app.post('/api/cli-sessions/delete', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const body = req.body as { cwd?: string; sessionId?: string };
  if (!body?.cwd || !body?.sessionId) {
    res.status(400).json({ error: 'cwd and sessionId are required' });
    return;
  }
  try {
    const abs = resolveWorkingDir(body.cwd);
    deleteCliSession(abs, body.sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * File upload pipeline. Multer streams each part into the session's working
 * directory under `.bridge-uploads/`, prefixed with a timestamp to keep the
 * names unique and sortable. The route below returns the resulting absolute
 * paths so the client can mention them to Claude.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const sessionId = String(req.header('x-session-id') ?? '');
      const session = manager.get(sessionId);
      if (!session) return cb(new Error('unknown session'), '');
      const dir = join(session.meta().cwd, '.bridge-uploads');
      try {
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err as Error, '');
      }
    },
    filename(_req, file, cb) {
      // Keep the original name but prefix a sortable timestamp so repeat
      // uploads never collide and Claude can spot related files by mtime.
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
      const ext = safe ? '' : extname(file.originalname) || '';
      cb(null, `${ts}-${safe || `upload${ext}`}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
});

app.post('/api/upload', (req, res, next) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  upload.array('files')(req, res, (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    res.json({
      files: files.map((f) => ({
        path: f.path,
        name: f.originalname,
        size: f.size,
        mime: f.mimetype,
      })),
    });
    next?.();
  });
});

/**
 * Web Push: publish the VAPID public key so clients can derive a subscription,
 * and accept/revoke browser subscriptions. Without authentication this would
 * be a way for randoms to silently steal pushes, so every endpoint checks
 * the bridge's AUTH_TOKEN header.
 */
app.get('/api/push/key', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ publicKey: push.publicKey, subscribers: push.subscriberCount });
});

app.post('/api/push/subscribe', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const body = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    expirationTime?: number | null;
    label?: string;
  };
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    res.status(400).json({ error: 'malformed subscription' });
    return;
  }
  push.subscribe({
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    expirationTime: body.expirationTime ?? null,
    label: body.label,
  });
  res.json({ ok: true, subscribers: push.subscriberCount });
});

app.post('/api/push/unsubscribe', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const endpoint = (req.body as { endpoint?: string })?.endpoint;
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint required' });
    return;
  }
  push.unsubscribe(endpoint);
  res.json({ ok: true });
});

/** Fire a test push so users can verify the round-trip after subscribing. */
app.post('/api/push/test', async (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  await push.notify({
    title: '✓ 通知已开启',
    body: 'Claude Bridge 现在可以推送到这台设备了',
    tag: 'test',
  });
  res.json({ ok: true });
});

/** Branch + dirty count for the topbar status pill. */
app.get('/api/git', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : '';
  if (!cwd) {
    res.status(400).json({ error: 'cwd is required' });
    return;
  }
  try {
    const abs = resolveWorkingDir(cwd);
    const status = gitStatus(abs);
    if (!status) {
      res.json({ isRepo: false });
      return;
    }
    res.json({ isRepo: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/dirs', (req, res) => {
  if (req.header('x-auth-token') !== config.authToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  try {
    const abs = resolveWorkingDir(rawPath || manager.defaultCwd);
    const entries = readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    const parent = dirname(abs);
    res.json({ path: abs, parent: parent === abs ? null : parent, entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const manager = new SessionManager({
  cwd: config.projectDir,
  permissionMode: config.permissionMode,
});

/** Find the first user-typed text inside a history list, for titling sessions. */
function firstUserText(history: { msg: { type: string; text?: string } }[]): string | null {
  for (const entry of history) {
    if (entry.msg.type === 'user_echo' && entry.msg.text) return entry.msg.text;
  }
  return null;
}

/** Resolve a user-supplied path to an absolute, existing directory. */
function resolveWorkingDir(input: string): string {
  let raw = input.trim();
  if (raw === '~' || raw.startsWith('~/')) raw = homedir() + raw.slice(1);
  const abs = resolve(raw);
  const stat = statSync(abs); // throws ENOENT if the path does not exist
  if (!stat.isDirectory()) throw new Error('该路径不是目录');
  return abs;
}

wss.on('connection', (ws: WebSocket) => {
  let authed = false;
  let currentId: string | null = null;
  let unsubSession: (() => void) | null = null;
  let unsubManager: (() => void) | null = null;

  const send = (msg: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const sendSessions = (): void => {
    send({ type: 'sessions', list: manager.list(), activeId: currentId });
  };

  /**
   * Point this client at a session: wake it if dormant, announce it, then
   * replay history. Waking is what makes "continue an old conversation" work.
   */
  const selectSession = (id: string): void => {
    const session = manager.get(id);
    if (!session) return;
    unsubSession?.();
    currentId = id;
    if (session.state === 'dormant') session.start();
    sendSessions();
    unsubSession = session.subscribe(send);
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send({ type: 'error', message: 'malformed JSON' });
      return;
    }

    if (!authed) {
      if (msg.type === 'auth' && msg.token === config.authToken) {
        authed = true;
        send({ type: 'auth_ok', defaultCwd: manager.defaultCwd });
        unsubManager = manager.onChange(sendSessions);
        // Prefer continuing the most recent session over creating a blank one.
        // If there are zero sessions on disk, start one so the UI isn't empty.
        const session = manager.latest() ?? manager.create();
        selectSession(session.id);
      } else {
        send({ type: 'auth_error', message: 'invalid or missing token' });
        ws.close();
      }
      return;
    }

    switch (msg.type) {
      case 'new_session': {
        let cwd = manager.defaultCwd;
        if (msg.cwd && msg.cwd.trim()) {
          try {
            cwd = resolveWorkingDir(msg.cwd);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            send({ type: 'error', message: `无法在该目录新建会话:${msg.cwd}（${reason}）` });
            break;
          }
        }
        // If the user picked a Claude CLI session to resume, pre-load its
        // transcript into the bridge history and tell the SDK to resume it.
        const resumeId = msg.resumeClaudeSessionId;
        const model = msg.model;
        if (resumeId) {
          const history = loadCliHistory(cwd, resumeId);
          const title = firstUserText(history)?.slice(0, 60) ?? '终端会话';
          selectSession(
            manager.create({ cwd, resumeClaudeSessionId: resumeId, history, title, model }).id,
          );
        } else {
          selectSession(manager.create({ cwd, model }).id);
        }
        break;
      }
      case 'set_model':
        if (currentId) void manager.get(currentId)?.setModel(String(msg.model ?? ''));
        break;
      case 'select_session':
        selectSession(msg.id);
        break;
      case 'delete_session': {
        manager.delete(msg.id);
        if (currentId === msg.id) {
          currentId = null;
          unsubSession?.();
          unsubSession = null;
          const fallback = manager.latest() ?? manager.create();
          selectSession(fallback.id);
        }
        break;
      }
      case 'rename_session':
        manager.get(msg.id)?.rename(msg.title);
        break;
      case 'prompt':
        if (currentId) manager.get(currentId)?.sendPrompt(String(msg.text ?? ''));
        break;
      case 'permission':
        if (currentId) manager.get(currentId)?.resolvePermission(msg.id, msg.decision);
        break;
      case 'interrupt':
        if (currentId) void manager.get(currentId)?.interrupt();
        break;
      default:
        send({ type: 'error', message: 'unknown message type' });
    }
  });

  ws.on('close', () => {
    unsubSession?.();
    unsubManager?.();
  });
});

// SPA fallback: hand any unmatched GET back to React (e.g. /settings, /sw.js
// already served above). We register it last so /api and static assets win.
app.get(/^\/(?!api\/|health$|ws$).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  const indexFile = join(webRoot, 'index.html');
  if (existsSync(indexFile)) res.sendFile(indexFile);
  else next();
});

httpServer.listen(config.port, () => {
  console.log(`[bridge] listening on http://localhost:${config.port}`);
  console.log(`[bridge] project dir: ${config.projectDir}`);
  console.log(`[bridge] permission mode: ${config.permissionMode}`);
});

function shutdown(): void {
  console.log('\n[bridge] shutting down');
  manager.closeAll();
  httpServer.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
