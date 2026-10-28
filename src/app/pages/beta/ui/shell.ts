import { Page } from '../route';

export type ShellTab = 'songs' | 'styles' | 'admin';
export interface ShellSpec { active: ShellTab; title: string; back?: { href: string; label: string } }

const SHELL: Partial<Record<Page, ShellSpec>> = {
  beta: { active: 'songs', title: '我的歌曲' },
  'beta-song': { active: 'songs', title: '', back: { href: '/my', label: '我的歌曲' } },
  'beta-styles': { active: 'styles', title: '風格' },
  'beta-admin': { active: 'admin', title: '管理' },
  'beta-admin-song': { active: 'admin', title: '', back: { href: '/my/admin', label: '管理' } },
};

/** The beta shell's active tab and phone top bar for a page; undefined for pages outside the shell. */
export const shellFor = (page: Page): ShellSpec | undefined => SHELL[page];
