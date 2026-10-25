// The delivery page of a song (one Artifact per song): the video in phone-sized parts, the pictures a person must
// confirm before it ships (every painted frame with people, every new character pose, the checker's doubts and
// substitutes first), and feedback on each shot and on the whole. What people mark is kept in the page's own database
// (db capability) and read back by lessons.mts into the experience base every later song is planned with.
//
// npx tsx scripts/lyric-vj/review-page.mts --song out/db/<id>/song.json --keyframes out/research/<kf> --cutout out/research/<cut> --video <full.mp4> --out <page dir>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import type { QaEntry, Spec } from './cutout.mts';
import { Board, frameTimes } from './keyframes.mts';

/** The parts a song's video is cut into for a phone (about 45 s each, under the 15 MB a published file may be). */
export const parts = (sec: number, len = 45) => {
  const n = Math.max(1, Math.round(sec / len));
  return Array.from({ length: n }, (_, i) => [+((i * sec) / n).toFixed(2), +(((i + 1) * sec) / n).toFixed(2)] as [number, number]);
};

/** Which pictures go in front of a person: doubts, substitutes and dropped poses first, then the rest to confirm. */
export const confirmOrder = (qa: QaEntry[]) => {
  const rank = (e: QaEntry) => (e.status === 'uncertain' ? 0 : e.status === 'substitute' || e.status === 'dropped' ? 1 : 2);
  return [...qa].sort((a, b) => rank(a) - rank(b));
};

/** A shot's plan in a few readable lines (what the frame is made of), shown under its still. */
export const planOf = (s: Spec['shots'][number]) => [
  `主角：${({ people: '人物', object: '物體', place: '場景' } as Record<string, string>)[s.subject] ?? s.subject}　畫法：${s.mode === 'painted' ? '整張畫' : '立繪＋背景'}`,
  `版面：${s.layout.shape}　轉場：${s.transition}${s.pulse ? '　跟拍' : ''}${s.key ? '　關鍵格' : ''}`,
  ...(s.actors.length ? [`人物：${s.actors.map((a) => a.sprite + (a.then ? ` → ${a.then}` : '')).join('、')}`] : []),
  ...(s.props.length ? [`道具：${s.props.map((p) => `${p.sprite}（${p.motion}）`).join('、')}`] : []),
  ...(s.floor ? [`場景字：${s.floor}`] : []),
  ...(s.shows ? [`畫面：${s.shows}`] : []),
].join('\n');

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function main() {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, keyframes: { type: 'string' }, cutout: { type: 'string' }, video: { type: 'string' }, out: { type: 'string' }, title: { type: 'string' } } });
  const out = a.out!, kf = a.keyframes!, cut = a.cutout!;
  mkdirSync(join(out, 'img'), { recursive: true });
  const song = JSON.parse(readFileSync(a.song!, 'utf8'));
  const board = JSON.parse(readFileSync(join(kf, 'board.json'), 'utf8')) as Board;
  const spec = JSON.parse(readFileSync(join(cut, 'spec.json'), 'utf8')) as Spec;
  const tr = JSON.parse(readFileSync(join(kf, 'treatment.json'), 'utf8'));
  const qa = Object.values(existsSync(join(cut, 'qa.json')) ? (JSON.parse(readFileSync(join(cut, 'qa.json'), 'utf8')) as Record<string, QaEntry>) : {});
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.video!]).toString());

  // the video, in parts
  const vids = parts(duration).map(([s, e], i) => {
    const file = `part${i + 1}.mp4`;
    if (!existsSync(join(out, file))) execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(s), '-t', String(e - s), '-i', a.video!, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-b:v', '2100k', '-maxrate', '2500k', '-bufsize', '4200k', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(out, file)]);
    return { file, s, e };
  });

  // every shot: its time, its line, a still from the middle of it
  const secs = tr.graphics.sections as { start: number; layers: { kind: string; asset?: string }[] }[];
  const timed = frameTimes(board, song.cues, 0, duration);
  const shots = timed.flatMap((f, i) => {
    const k = secs.findIndex((x) => x.layers.some((l) => l.kind === 'photo' && l.asset === `kf_${i + 1}`));
    if (k < 0) return [];
    const start = secs[k].start, end = secs[k + 1]?.start ?? f.end;
    const s = spec.shots.find((x) => x.frame === i + 1);
    return [{ n: i + 1, start, end, lyric: song.cues.find((c: { id: string }) => c.id === f.cue)?.text ?? '（間奏）', change: f.change, subject: s?.subject ?? 'people', mode: s?.mode ?? 'cutout', plan: s ? planOf(s) : '' }];
  });
  for (const s of shots) {
    const file = join(out, 'img', `shot-${s.n}.jpg`);
    if (!existsSync(file)) execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(Math.min(duration - 0.1, (s.start + s.end) / 2)), '-i', a.video!, '-frames:v', '1', '-vf', 'scale=640:360', '-update', '1', file]);
  }

  // the pictures to confirm: every checked picture, doubts first
  // every painted frame with people and every character pose is shown, checked or not (pictures drawn before the
  // check log existed have no entry: they are listed to confirm all the same)
  const listed: QaEntry[] = [
    ...spec.shots.filter((x) => x.mode === 'painted' && x.subject === 'people').map((x) => ({ kind: 'paint' as const, id: String(x.frame), file: join(cut, `paint_${x.frame}.jpg`), status: 'pass' as const, problems: [], tries: 0 })),
    ...spec.sprites.filter((x) => x.who.length).map((x) => ({ kind: 'pose' as const, id: x.id, file: join(cut, 'spr', `${x.id}.png`), status: 'pass' as const, problems: [], tries: 0 })),
  ];
  const all = [...qa, ...listed.filter((l) => !qa.some((q) => q.kind === l.kind && q.id === l.id))].map((e) => (e.kind === 'pose' && e.file.endsWith('.jpg') && existsSync(e.file.replace(/\.jpg$/, '.png')) ? { ...e, file: e.file.replace(/\.jpg$/, '.png') } : e));
  const confirm = await Promise.all(confirmOrder(all).filter((e) => existsSync(e.file)).map(async (e) => {
    const img = `img/${e.kind}-${e.id}.jpg`;
    if (!existsSync(join(out, img))) await sharp(e.file).resize(640, 640, { fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toFile(join(out, img));
    return { key: `${e.kind}-${e.id}`, img, kind: e.kind, status: e.status, problems: e.problems.filter(Boolean).join(' / ') };
  }));

  const data = { song: song.title, story: board.logline, vids, shots, confirm };
  writeFileSync(join(out, 'index.html'), page(a.title ?? song.title, data));
  console.log(`review page: ${vids.length} parts, ${shots.length} shots, ${confirm.length} pictures to confirm → ${join(out, 'index.html')}`);
}

const TAGS = ['人物畫錯', '歌詞擋到', '動作重複', '不合故事', '畫風', '節奏', '版面', '其他'];

function page(title: string, data: { song: string; story: string; vids: { file: string; s: number; e: number }[]; shots: { n: number; start: number; end: number; lyric: string; change: string; subject: string; mode: string; plan: string }[]; confirm: { key: string; img: string; kind: string; status: string; problems: string }[] }) {
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const statusText: Record<string, string> = { uncertain: 'AI 不確定，請看', substitute: '畫不好，已換成替代鏡頭', dropped: '姿勢畫不好，已拿掉', fail: 'AI 判定有錯', pass: '請確認' };
  return `<title>${esc(title)}回饋</title><style>
:root{--bg:#f6f4f0;--panel:#fff;--fg:#1d1b22;--muted:#6b6676;--line:#e3dfe8;--accent:#c4325a;--good:#2f8a4e;--fix:#b8860b;--bad:#c4325a;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121016;--panel:#1b1821;--fg:#f1eef5;--muted:#a59fb0;--line:#2c2833;--accent:#ff6f91;--good:#5cc584;--fix:#e6b450;--bad:#ff6f91;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121016;--panel:#1b1821;--fg:#f1eef5;--muted:#a59fb0;--line:#2c2833;--accent:#ff6f91;--good:#5cc584;--fix:#e6b450;--bad:#ff6f91;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:"Hiragino Sans","Noto Sans TC",sans-serif;line-height:1.6;margin:0;padding:20px max(16px,env(safe-area-inset-right,0px)) 60px max(16px,env(safe-area-inset-left,0px))}
main{max-width:980px;margin:0 auto;display:grid;gap:18px}h1{margin:0;font-size:clamp(22px,5vw,30px)}h2{margin:0;font-size:18px}p{margin:0}.muted{color:var(--muted);font-size:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:10px;min-width:0}
video,.card img{width:100%;border-radius:8px;display:block;background:#000}video{aspect-ratio:16/9}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.item{border:1px solid var(--line);border-radius:10px;padding:10px;display:grid;gap:8px;min-width:0}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--line);justify-self:start}.badge.warn{background:var(--accent);color:#fff}
.row{display:flex;flex-wrap:wrap;gap:6px}button{font:inherit;font-size:14px;border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:8px;padding:6px 10px;cursor:pointer;min-height:36px}
button[aria-pressed="true"].good{background:var(--good);color:#fff;border-color:var(--good)}button[aria-pressed="true"].fix{background:var(--fix);color:#fff;border-color:var(--fix)}button[aria-pressed="true"].bad{background:var(--bad);color:#fff;border-color:var(--bad)}
button.tag[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
textarea{font:inherit;font-size:14px;width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px;background:transparent;color:var(--fg);min-height:56px;resize:vertical}
.saved{font-size:12px;color:var(--muted);min-height:16px}#status{position:sticky;top:0;background:var(--bg);padding:6px 0;font-size:13px;color:var(--muted);z-index:2}
</style>
<main>
<header class="card" style="background:transparent;border:0;padding:0"><h1>${esc(data.song)}</h1><p class="muted">${esc(data.story)}</p></header>
<div id="status">連線中…</div>
<section class="card"><h2>影片</h2>${data.vids.map((v, i) => `<p class="muted">${i + 1}／${data.vids.length}（${mmss(v.s)}–${mmss(v.e)}）</p><video src="${v.file}" controls playsinline preload="metadata"></video>`).join('')}</section>
<section class="card"><h2>出貨前確認的圖（${data.confirm.length} 張）</h2><p class="muted">AI 不確定的、被換掉的排在最前面。看到人物畫錯（多手、頭身錯位、同一人出現兩次、姿勢不合理）請按「要重畫」並寫哪裡錯。</p><div class="grid">${data.confirm.map((c) => `<div class="item" data-doc="review/${esc(c.key)}"><img src="${c.img}" alt="${c.kind === 'pose' ? '人物立繪' : '整張畫'} ${esc(c.key)}" loading="lazy"><span class="badge${c.status === 'uncertain' || c.status === 'substitute' || c.status === 'dropped' ? ' warn' : ''}">${c.kind === 'pose' ? '立繪' : '整張畫'}・${statusText[c.status] ?? c.status}</span>${c.problems ? `<p class="muted">${esc(c.problems)}</p>` : ''}<div class="row"><button class="good" data-v="ok" aria-pressed="false">OK</button><button class="bad" data-v="redo" aria-pressed="false">要重畫</button></div><textarea placeholder="哪裡錯（選填）"></textarea><div class="saved"></div></div>`).join('')}</div></section>
<section class="card"><h2>每一格的回饋</h2><p class="muted">只標有感覺的就好：好、要修、不好；可以勾問題類型、寫一句原因。</p><div class="grid">${data.shots.map((s) => `<div class="item" data-doc="feedback/shot-${s.n}"><img src="img/shot-${s.n}.jpg" alt="第 ${s.n} 格截圖" loading="lazy"><p><b>${s.n}. ${mmss(s.start)}</b> ${esc(s.lyric)}</p><p class="muted">${esc(s.change)}</p>${s.plan ? `<details><summary class="muted">這格的分鏡資料</summary><pre style="white-space:pre-wrap;font-size:12px;margin:6px 0 0">${esc(s.plan)}</pre></details>` : ''}<div class="row"><button class="good" data-v="good" aria-pressed="false">好</button><button class="fix" data-v="fix" aria-pressed="false">要修</button><button class="bad" data-v="bad" aria-pressed="false">不好</button></div><div class="row">${TAGS.map((t) => `<button class="tag" data-t="${t}" aria-pressed="false">${t}</button>`).join('')}</div><textarea placeholder="原因或想法（選填）"></textarea><div class="saved"></div></div>`).join('')}</div></section>
<section class="card"><h2>整首回饋</h2><div class="item" data-doc="feedback/overall" style="border:0;padding:0">${['good', 'fix', 'bad'].map((k) => `<label class="muted" for="o-${k}">${{ good: '哪裡好', fix: '哪裡想修', bad: '哪裡不好' }[k]}</label><textarea id="o-${k}" data-f="${k}"></textarea>`).join('')}<div class="saved"></div></div></section>
</main>
<script>
(async () => {
  const status = document.getElementById('status');
  const db = await claude.use('db');
  if (!db) { status.textContent = '這個檢視無法儲存回饋（只能觀看）。'; document.querySelectorAll('button,textarea').forEach((el) => (el.disabled = true)); return; }
  status.textContent = '回饋會自動儲存。';
  const items = [...document.querySelectorAll('[data-doc]')];
  const state = new Map();
  const paint = (el, d) => {
    el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(d.verdict === b.dataset.v)));
    el.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String((d.tags || []).includes(b.dataset.t))));
    el.querySelectorAll('textarea').forEach((t) => { const f = t.dataset.f || 'note'; if (document.activeElement !== t) t.value = d[f] || ''; });
  };
  // one write at a time per document, after a pause in typing
  const timers = new Map(), writing = new Map();
  const save = (el) => {
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(async () => {
      if (writing.get(el)) return save(el);
      writing.set(el, true);
      const d = { ...(state.get(el) || {}), at: new Date().toISOString() };
      try { await db.doc(el.dataset.doc).set(d); el.querySelector('.saved').textContent = '已儲存'; }
      catch (e) { el.querySelector('.saved').textContent = e && e.code === 'invalid_argument' ? '沒有儲存權限' : '儲存失敗，稍後再試'; }
      writing.set(el, false);
    }, 600));
  };
  for (const el of items) {
    state.set(el, {});
    el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { const d = state.get(el); d.verdict = d.verdict === b.dataset.v ? '' : b.dataset.v; paint(el, d); save(el); }));
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { const d = state.get(el); const s = new Set(d.tags || []); s.has(b.dataset.t) ? s.delete(b.dataset.t) : s.add(b.dataset.t); d.tags = [...s]; paint(el, d); save(el); }));
    el.querySelectorAll('textarea').forEach((t) => t.addEventListener('input', () => { state.get(el)[t.dataset.f || 'note'] = t.value; save(el); }));
  }
  // what was marked before (by this person or anyone else) comes back once per collection
  for (const col of ['feedback', 'review']) db.collection(col).onSnapshot((snap) => {
    for (const doc of snap.docs) {
      const el = items.find((x) => x.dataset.doc === col + '/' + doc.id);
      if (!el || doc.metadata.hasPendingWrites) continue;
      const d = { ...doc.data() }; state.set(el, d); paint(el, d);
    }
  }, () => { status.textContent = '回饋暫時無法同步，輸入的內容仍會嘗試儲存。'; });
})();
</script>`;
}

if (process.argv[1]?.endsWith('review-page.mts')) await main();
