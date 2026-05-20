import { execFileSync } from 'node:child_process';

export interface GitStatus {
  branch: string;
  /** Number of files with uncommitted changes (staged + unstaged + untracked). */
  dirty: number;
  ahead: number;
  behind: number;
}

/**
 * Run `git status --porcelain -b` for `cwd` and parse the result.
 * Returns `null` if the directory is not a git repository or the call fails.
 */
export function gitStatus(cwd: string): GitStatus | null {
  let out: string;
  try {
    out = execFileSync('git', ['status', '--porcelain=v1', '-b', '--untracked-files=all'], {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }

  const lines = out.split('\n');
  const head = lines[0] ?? '';
  // `## main...origin/main [ahead 1, behind 2]`  or  `## HEAD (no branch)` (detached)
  let branch = '?';
  let ahead = 0;
  let behind = 0;

  if (head.startsWith('## ')) {
    const rest = head.slice(3);
    const branchPart = rest.split(/\s|\.{3}/, 1)[0];
    branch = branchPart || '?';
    const aheadMatch = rest.match(/ahead (\d+)/);
    const behindMatch = rest.match(/behind (\d+)/);
    if (aheadMatch) ahead = Number(aheadMatch[1]);
    if (behindMatch) behind = Number(behindMatch[1]);
  }

  const dirty = lines.slice(1).filter((l) => l.trim().length > 0).length;
  return { branch, dirty, ahead, behind };
}
