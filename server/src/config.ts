import 'dotenv/config';

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

const VALID_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

function readPermissionMode(): PermissionMode {
  const raw = process.env.PERMISSION_MODE ?? 'default';
  if (!VALID_MODES.includes(raw as PermissionMode)) {
    console.error(`[fatal] PERMISSION_MODE "${raw}" is invalid. Use one of: ${VALID_MODES.join(', ')}`);
    process.exit(1);
  }
  return raw as PermissionMode;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  authToken: process.env.AUTH_TOKEN ?? '',
  projectDir: process.env.PROJECT_DIR ?? process.cwd(),
  permissionMode: readPermissionMode(),
} as const;

if (!config.authToken) {
  console.error('[fatal] AUTH_TOKEN is required. Copy .env.example to .env and set it.');
  process.exit(1);
}

if (config.authToken.length < 16) {
  console.error('[fatal] AUTH_TOKEN is too short — use at least 16 characters.');
  process.exit(1);
}
