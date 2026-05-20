import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEntry } from '@mobileai/shared';

const ROOT = join(homedir(), '.claude-bridge', 'sessions');

export interface PersistedSession {
  id: string;
  title: string;
  createdAt: number;
  cwd: string;
  claudeSessionId: string | null;
  history: HistoryEntry[];
  /** Optional — older files won't have it; treated as the SDK default. */
  model?: string;
}

/**
 * Filesystem-backed store for chat sessions. One JSON file per session lives
 * in `~/.claude-bridge/sessions/`, simple enough to inspect or delete by hand.
 */
export class SessionStore {
  constructor() {
    mkdirSync(ROOT, { recursive: true });
  }

  loadAll(): PersistedSession[] {
    const files = readdirSync(ROOT).filter((f) => f.endsWith('.json'));
    const out: PersistedSession[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(ROOT, file), 'utf8');
        out.push(JSON.parse(raw) as PersistedSession);
      } catch (err) {
        console.error(`[store] skipping malformed ${file}:`, err);
      }
    }
    return out;
  }

  save(session: PersistedSession): void {
    const tmp = join(ROOT, `${session.id}.json.tmp`);
    const final = join(ROOT, `${session.id}.json`);
    writeFileSync(tmp, JSON.stringify(session));
    // Atomic-ish swap: a crash mid-write leaves the previous file intact.
    try {
      writeFileSync(final, JSON.stringify(session));
      unlinkSync(tmp);
    } catch {
      unlinkSync(tmp);
    }
  }

  delete(id: string): void {
    try {
      unlinkSync(join(ROOT, `${id}.json`));
    } catch {
      /* file may not exist yet */
    }
  }
}
