// When a world may print the song's title (owner rule, 2026-11-04): never as a standing label or header on every frame of
// a style. It shows only on a cut that opens in the song's opening, before the singing has settled in; after that the
// worlds print only the data of the moment (the time of an entry, how many lines). One rule, here, for every world that
// labels its page (file, card, chalkboard, the terminal's set pieces).
export const TITLE_OPENING_SEC = 15;

/** The title a frame may show, or '' (the cut began after the song's opening). */
export const titleNow = (e: { title?: string; now: number; age: number }) => (e.now - Math.max(0, e.age) < TITLE_OPENING_SEC ? (e.title ?? '') : '');
