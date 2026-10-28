/** A song's status as the README names it (◐ ◷ ✓ ● ↻ ! ?); the tone picks the colour tokens. */
export type StatusKind = 'preparing' | 'prepFailed' | 'timing' | 'ready' | 'making' | 'retrying' | 'help' | 'concept';
export type StatusTone = 'info' | 'warn' | 'ok' | 'bad' | 'making';
export interface StatusChip { icon: string; label: string; tone: StatusTone }

export const STATUS_CHIP: Record<StatusKind, StatusChip> = {
  preparing: { icon: '◐', label: '準備中', tone: 'info' },
  prepFailed: { icon: '!', label: '準備失敗', tone: 'bad' },
  timing: { icon: '◷', label: '待確認時間', tone: 'warn' },
  ready: { icon: '✓', label: '可製作', tone: 'ok' },
  making: { icon: '●', label: '製作中', tone: 'making' },
  retrying: { icon: '↻', label: '自動重試中', tone: 'warn' },
  help: { icon: '!', label: '需要協助', tone: 'bad' },
  concept: { icon: '?', label: '概念待確認', tone: 'warn' },
};
