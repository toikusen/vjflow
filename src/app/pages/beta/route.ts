export type Page = 'beta-admin-song' | 'beta-admin' | 'beta-song' | 'beta' | 'admin' | 'timing' | 'studio' | 'home';

// longer prefixes first: /my/admin/song before /my/admin before /my
const ROUTES: [string, Page][] = [
  ['/my/admin/song', 'beta-admin-song'],
  ['/my/admin', 'beta-admin'],
  ['/my/song', 'beta-song'],
  ['/my', 'beta'],
  ['/admin', 'admin'],
  ['/timing', 'timing'],
  ['/studio', 'studio'],
];

/** Which page a path shows (a prefix check, the app has no router). */
export const pageFor = (path: string): Page => ROUTES.find(([p]) => path.startsWith(p))?.[1] ?? 'home';
