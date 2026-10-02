// Admin backend for the lyric-VJ pipeline (dev): job statuses and generated files for the /admin page.
// npx tsx scripts/lyric-vj/dashboard.mts   (then `npm start` and open http://localhost:4200/admin)
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { JOBS_DIR } from './status.mts';

const PORT = 4310;
const OUT_ROOT = resolve('out');
const TYPES: Record<string, string> = { '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/lyric-vj/jobs') {
    const jobs = existsSync(JOBS_DIR)
      ? readdirSync(JOBS_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf8')))
      : [];
    jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(jobs));
    return;
  }
  if (url.pathname.startsWith('/lyric-vj/files/')) {
    // only files under out/, and only media types the page shows
    const file = resolve(OUT_ROOT, decodeURIComponent(url.pathname.slice('/lyric-vj/files/'.length)));
    const type = TYPES[extname(file)];
    if (!file.startsWith(OUT_ROOT + sep) || !type || !existsSync(file)) return void res.writeHead(404).end();
    const size = statSync(file).size;
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    // videos seek with range requests
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => console.log(`lyric-vj dashboard backend on http://127.0.0.1:${PORT}`));
