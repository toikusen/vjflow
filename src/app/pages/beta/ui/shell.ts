import { Page } from '../route';

export type ShellTab = 'songs' | 'styles' | 'admin';
/** `ownTop`: the page draws its own phone top (the song hero carries the back link and the balance, 2e), so the shell hides its bar. */
export interface ShellSpec { active: ShellTab; title: string; back?: { href: string; label: string }; ownTop?: boolean }

const SHELL: Partial<Record<Page, ShellSpec>> = {
  beta: { active: 'songs', title: '我的歌曲' },
  'beta-song': { active: 'songs', title: '', back: { href: '/my', label: '我的歌曲' }, ownTop: true },
  'beta-styles': { active: 'styles', title: '風格' },
  'beta-admin': { active: 'admin', title: '管理' },
  'beta-admin-song': { active: 'admin', title: '', back: { href: '/my/admin', label: '管理' } },
};

/**
 * The beta shell's active tab and phone top bar for a page; undefined for pages outside the shell.
 * The timing editor is in the shell only for a tester's song (`/timing?beta=<id>`); it draws its own top bar (2c, 2e).
 */
export const shellFor = (page: Page, search = ''): ShellSpec | undefined => {
  if (page === 'timing') return new URLSearchParams(search).has('beta') ? { active: 'songs', title: '歌詞時間', back: { href: '/my', label: '我的歌曲' }, ownTop: true } : undefined;
  return SHELL[page];
};
