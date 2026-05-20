/**
 * Models the user can pick in the topbar / new-session dialog.
 * Pricing is per-million tokens (USD) — used to colour the "cost" hint.
 */
export interface ModelChoice {
  id: string;
  label: string;
  short: string;
  hint: string;
  /** Higher = pricier; used to colour the picker chip. */
  tier: 'cheap' | 'balanced' | 'premium';
}

export const MODELS: ModelChoice[] = [
  {
    id: '',
    label: 'Default',
    short: '默认',
    hint: 'SDK 内置选择',
    tier: 'balanced',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    short: 'Haiku',
    hint: '快 · 便宜 · 适合简单查询',
    tier: 'cheap',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    short: 'Sonnet',
    hint: '主力编码模型',
    tier: 'balanced',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    short: 'Opus',
    hint: '强 · 贵 · 重活和复杂推理',
    tier: 'premium',
  },
];

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.short ?? (id || '默认');
}
