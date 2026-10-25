// The labelling page for the error set: every person picture of the given runs (current ones and those the checks
// replaced), each to be marked hands right / hands wrong / can't tell by a person. The answers (page db, collection
// `labels`) are the ground truth the hand checkers are measured against (bench-hands.mts); what the checkers said is
// kept off the page so it does not lead the eye.
//
// npx tsx scripts/lyric-vj/label-page.mts --runs out/research/snowSBW2,out/research/taimeiBW2 --out <page dir>
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import type { Spec } from './cutout.mts';

/** The person pictures of a run: character poses and painted frames with people, in every version kept on disk. */
export function personPictures(dir: string, spec: Pick<Spec, 'sprites' | 'shots'>, list: (d: string) => string[]) {
  const poses = new Set(spec.sprites.filter((x) => x.who.length).map((x) => x.id));
  const frames = new Set(spec.shots.filter((x) => x.subject === 'people').map((x) => x.frame));
  const spr = list(join(dir, 'spr')).flatMap((f) => { const m = f.match(/^(.+?)(\.reject\d|\.recheck)?\.jpg$/); return m && poses.has(m[1]) ? [join(dir, 'spr', f)] : []; });
  const paint = list(dir).flatMap((f) => { const m = f.match(/^paint_(\d+)(\.reject\d|\.recheck)?\.jpg$/); return m && frames.has(Number(m[1])) ? [join(dir, f)] : []; });
  return [...spr, ...paint];
}

/** A database document id for a picture: its run and file name, in the characters a document id allows. */
export const labelId = (file: string) => `${basename(join(file, file.includes('/spr/') ? '../..' : '..'))}~${basename(file)}`.replace(/[^A-Za-z0-9_\-.~]/g, '_');

async function main() {
  const { values: a } = parseArgs({ options: { runs: { type: 'string' }, out: { type: 'string' } } });
  const out = a.out!;
  mkdirSync(join(out, 'img'), { recursive: true });
  const files = a.runs!.split(',').flatMap((dir) => personPictures(dir, JSON.parse(readFileSync(join(dir, 'spec.json'), 'utf8')), (d) => (existsSync(d) ? readdirSync(d) : [])));
  const items = await Promise.all(files.map(async (f) => {
    const id = labelId(f), img = `img/${id}.jpg`, big = `img/${id}.big.jpg`;
    if (!existsSync(join(out, img))) await sharp(f).resize(700, 700, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(join(out, img));
    if (!existsSync(join(out, big))) await sharp(f).resize(1600, 1600, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(join(out, big));
    return { id, img, big };
  }));
  writeFileSync(join(out, 'index.html'), page(items));
  writeFileSync(join(out, 'items.json'), JSON.stringify(Object.fromEntries(files.map((f) => [labelId(f), f])), null, 1));
  console.log(`label page: ${items.length} pictures → ${join(out, 'index.html')}`);
}

function page(items: { id: string; img: string; big: string }[]) {
  return `<title>手部標記</title><style>
:root{--bg:#f6f4f0;--panel:#fff;--fg:#1d1b22;--muted:#6b6676;--line:#e3dfe8;--good:#2f8a4e;--bad:#c4325a;--mid:#b8860b;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121016;--panel:#1b1821;--fg:#f1eef5;--muted:#a59fb0;--line:#2c2833;--good:#5cc584;--bad:#ff6f91;--mid:#e6b450;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121016;--panel:#1b1821;--fg:#f1eef5;--muted:#a59fb0;--line:#2c2833;--good:#5cc584;--bad:#ff6f91;--mid:#e6b450;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:"Hiragino Sans","Noto Sans TC",sans-serif;line-height:1.6;margin:0;padding:16px max(16px,env(safe-area-inset-right,0px)) 60px max(16px,env(safe-area-inset-left,0px))}
main{max-width:980px;margin:0 auto;display:grid;gap:14px}h1{margin:0;font-size:24px}p{margin:0}.muted{color:var(--muted);font-size:14px}
#bar{position:sticky;top:0;background:var(--bg);padding:8px 0;font-size:14px;z-index:2;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.item{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;display:grid;gap:8px;min-width:0}
.item img{width:100%;border-radius:6px;display:block;background:#ddd}.item.done{opacity:.55}
.row{display:flex;flex-wrap:wrap;gap:6px}button{font:inherit;font-size:14px;border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:8px;padding:6px 10px;cursor:pointer;min-height:40px;flex:1}
button[aria-pressed="true"][data-v="ok"]{background:var(--good);color:#fff}button[aria-pressed="true"][data-v="bad"]{background:var(--bad);color:#fff}button[aria-pressed="true"][data-v="unsure"]{background:var(--mid);color:#fff}button[aria-pressed="true"].other{background:var(--fg);color:var(--bg)}
input{font:inherit;font-size:14px;width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:transparent;color:var(--fg)}
a{color:var(--muted);font-size:13px}
</style>
<main>
<h1>手部標記（${items.length} 張）</h1>
<p class="muted">只看手：每隻看得到的手是不是五根手指、有沒有多手或手接不到身體。點「放大」看清楚。其他地方畫錯（鞋子不成對、臉不對）就按「其他也錯」並寫一句。會自動儲存，可以分幾次標。</p>
<div id="bar">連線中…</div>
<div class="grid">${items.map((it) => `<div class="item" data-id="${it.id}"><img src="${it.img}" alt="人物圖 ${it.id}" loading="lazy"><a href="${it.big}" target="_blank" rel="noopener">放大</a><div class="row"><button data-v="ok" aria-pressed="false">手對</button><button data-v="bad" aria-pressed="false">手錯</button><button data-v="unsure" aria-pressed="false">看不清楚</button></div><div class="row"><button class="other" aria-pressed="false">其他也錯</button></div><input placeholder="哪裡錯（選填）"></div>`).join('')}</div>
</main>
<script>
(async () => {
  const bar = document.getElementById('bar'), items = [...document.querySelectorAll('.item')], total = items.length;
  const db = await claude.use('db');
  if (!db) { bar.textContent = '這個檢視無法儲存（只能觀看）。'; document.querySelectorAll('button,input').forEach((e) => (e.disabled = true)); return; }
  const state = new Map(items.map((el) => [el, {}]));
  const count = () => { const n = items.filter((el) => state.get(el).hands).length; bar.textContent = '已標 ' + n + ' / ' + total + '（自動儲存）'; };
  const paint = (el) => { const d = state.get(el); el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(d.hands === b.dataset.v))); el.querySelector('.other').setAttribute('aria-pressed', String(!!d.other)); const i = el.querySelector('input'); if (document.activeElement !== i) i.value = d.note || ''; el.classList.toggle('done', !!d.hands); };
  const timers = new Map(), busy = new Map();
  const save = (el) => { clearTimeout(timers.get(el)); timers.set(el, setTimeout(async () => { if (busy.get(el)) return save(el); busy.set(el, true); try { await db.doc('labels/' + el.dataset.id).set({ ...state.get(el), at: new Date().toISOString() }); } catch (e) { bar.textContent = e && e.code === 'invalid_argument' ? '沒有儲存權限' : '儲存失敗，稍後會再試'; } busy.set(el, false); count(); }, 400)); };
  for (const el of items) {
    el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { const d = state.get(el); d.hands = d.hands === b.dataset.v ? '' : b.dataset.v; paint(el); save(el); count(); }));
    el.querySelector('.other').addEventListener('click', () => { const d = state.get(el); d.other = !d.other; paint(el); save(el); });
    el.querySelector('input').addEventListener('input', (e) => { state.get(el).note = e.target.value; save(el); });
  }
  db.collection('labels').onSnapshot((snap) => { for (const doc of snap.docs) { const el = items.find((x) => x.dataset.id === doc.id); if (!el || doc.metadata.hasPendingWrites) continue; state.set(el, { ...doc.data() }); paint(el); } count(); }, () => { bar.textContent = '暫時無法同步，標記仍會嘗試儲存。'; });
  count();
})();
</script>`;
}

if (process.argv[1]?.endsWith('label-page.mts')) await main();
