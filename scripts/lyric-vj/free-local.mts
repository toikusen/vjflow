// Read-only test data for the local free page (/free under ng serve): the song list, a song with its cached reading, its
// audio. Serves files from out/db, spends nothing, writes nothing.
// npx tsx scripts/lyric-vj/free-local.mts [--port 4331]; ng serve's proxy sends /free-data here.
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { port: { type: 'string', default: '4331' } } });
const DB = 'out/db';
/** Where a song's cached reading is, for the songs that have one. */
const READINGS: Record<string, string> = { yt_w_fCuUR3lEs: 'nun', yt_5i50aTB7JFo: 'snow', yt_b3GCfyNKeLs: 'tsuzuki', yt_hCCskTJwvuc: 'choroin', yt_iwYXfOhcsYI: 'tenmon' };
const readingOf = (id: string) => (READINGS[id] ? join('out/research/instant/plans', READINGS[id], 'meaning.json') : '');
const songFile = (id: string) => join(DB, id.replace(/[^\w-]/g, ''), 'song.json');
const json = (res: import('node:http').ServerResponse, x: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(x));
const list = () => readdirSync(DB).filter((id) => existsSync(songFile(id))).flatMap((id) => {
  const s = JSON.parse(readFileSync(songFile(id), 'utf8'));
  return s.cues?.length && s.audio?.mix && existsSync(s.audio.mix) ? [{ id, title: s.title as string, duration: s.duration as number, lines: s.cues.length as number, reading: existsSync(readingOf(id)) }] : [];
}).sort((x, y) => Number(y.reading) - Number(x.reading));

createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const [, , what, id] = url.pathname.split('/');
  if (req.method !== 'GET') return void res.writeHead(405).end();
  if (what === 'songs') return json(res, list());
  if (!id || !existsSync(songFile(id))) return void res.writeHead(404).end();
  const song = JSON.parse(readFileSync(songFile(id), 'utf8'));
  if (what === 'song') return json(res, { song, meaning: existsSync(readingOf(id)) ? JSON.parse(readFileSync(readingOf(id), 'utf8')) : undefined });
  if (what !== 'audio') return void res.writeHead(404).end();
  const file = song.audio.mix as string;
  const size = statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  const [from, to] = range ? [Number(range[1] || 0), Number(range[2] || size - 1)] : [0, size - 1];
  res.writeHead(range ? 206 : 200, { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': to - from + 1, ...(range ? { 'content-range': `bytes ${from}-${to}/${size}` } : {}) });
  createReadStream(file, { start: from, end: to }).pipe(res);
}).listen(Number(a.port), '127.0.0.1', () => console.log(`free data on 127.0.0.1:${a.port}`));
