export type Page = 'free' | 'free-off' | 'beta-admin-song' | 'beta-admin' | 'beta-song' | 'beta-styles' | 'beta' | 'admin' | 'timing' | 'studio' | 'home';

// longer prefixes first: /my/admin/song before /my/admin before /my
const ROUTES: [string, Page][] = [
  ['/my/admin/song', 'beta-admin-song'],
  ['/my/admin', 'beta-admin'],
  ['/my/song', 'beta-song'],
  ['/my/styles', 'beta-styles'],
  ['/my', 'beta'],
  ['/admin', 'admin'],
  ['/timing', 'timing'],
  ['/studio', 'studio'],
];

const isFree = (path: string) => path === '/free' || path.startsWith('/free/');

/**
 * Which page a path shows (a prefix check, the app has no router). `/free`, the local free tier, opens only when asked
 * for: the app asks only in a dev build, and a production build answers with a plain notice instead of falling through
 * to the home page's generator, which reads as a broken free tier.
 */
export const pageFor = (path: string, o: { free?: boolean } = {}): Page => (isFree(path) ? (o.free ? 'free' : 'free-off') : (ROUTES.find(([p]) => path.startsWith(p))?.[1] ?? 'home'));
