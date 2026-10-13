// Google Fonts on disk: renders being compared get the same font bytes, and a network timeout cannot leave a page on
// fallback fonts (the caller fails the song on a miss).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type CachedFont = { body: Buffer; type: string };
type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

/**
 * A reader of `dir` (shared by worktrees and render processes) that fetches a missing URL once per process, with
 * three retries, and stores it so a reader never sees a half-written entry: every download writes temp files of its
 * own (pages of one process and other processes may fetch the same URL at once), the type lands before the body, and
 * each lands by rename. Resolves undefined when the URL is neither cached nor reachable.
 */
export function fontCache(dir: string, get: Fetch = fetch, wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms))) {
  const flight = new Map<string, Promise<CachedFont | undefined>>();
  const read = (file: string): CachedFont => ({ body: readFileSync(file), type: readFileSync(`${file}.type`, 'utf8') });
  const load = async (url: string, userAgent: string, file: string): Promise<CachedFont | undefined> => {
    const once = () => get(url, { headers: { 'user-agent': userAgent } }).catch(() => null);
    let r = await once();
    for (let k = 0; k < 3 && !r?.ok; k++) r = await wait(1000 * (k + 1)).then(once);
    if (!r?.ok) return undefined;
    const font = { body: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') ?? '' };
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomUUID()}`;
    writeFileSync(`${tmp}.type`, font.type);
    writeFileSync(tmp, font.body);
    renameSync(`${tmp}.type`, `${file}.type`);
    renameSync(tmp, file);
    return font;
  };
  return (url: string, userAgent: string): Promise<CachedFont | undefined> => {
    const file = join(dir, createHash('sha1').update(url).digest('hex'));
    if (existsSync(file)) return Promise.resolve(read(file));
    const pending = flight.get(url) ?? load(url, userAgent, file).finally(() => flight.delete(url));
    flight.set(url, pending);
    return pending;
  };
}
