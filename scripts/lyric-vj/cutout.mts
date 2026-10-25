// Cut-out story mode: the storyboard of keyframes.mts staged like a designed MV instead of one painted picture per
// frame. A few flat graphic sets (no people) and keyed character / prop cut-outs are drawn once and shared by every
// shot; each shot places them on a set, moves them in code (a slow camera with parallax, entrances, breathing, wind in
// cloth, a falling leaf) and keeps the painted keyframe only where bodies touch (a hug cut apart reads as two stickers).
// Memory and present meet through a ripple, not a cut.
//
// npx tsx scripts/lyric-vj/cutout.mts --song out/db/<id>/song.json --keyframes out/research/snowW --from 44 --to 75 --out out/research/snowB
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { lessonsText } from './lessons.mts';
import sharp from 'sharp';
import { Board, frameTimes, look } from './keyframes.mts';

export type Actor = { sprite: string; then: string; at: number; x: number; ground: number; h: number; flip: boolean; enter: 'none' | 'fade'; wind: boolean };
export type Prop = { sprite: string; x: number; y: number; h: number; motion: 'still' | 'fall' | 'flutter' | 'hang'; front: boolean; walk: number };
/** The window forms page.js draws (from the reference videos' window / split / frame / media layouts). */
export const SHAPES = ['full', 'circle', 'ellipse', 'rect', 'rounded', 'arch', 'diamond', 'hexagon', 'flower', 'keyhole', 'cloud', 'wavy', 'torn', 'brush', 'ticket', 'polaroid', 'filmstrip', 'window', 'phone', 'band', 'doubleband', 'split', 'panels'] as const;
/** Where the picture sits on the page: whole frame, or inside a window shape on paper (x -1..1, y 0..1 centre, size its height as a share of the frame, tilt in degrees). */
export type Layout = { shape: (typeof SHAPES)[number]; x: number; y: number; size: number; paper: string; tilt: number };
/** A song's page language: its paper, ink, texture and trim, and the few window shapes it keeps coming back to. */
export type Look = { paper: string; ink: string; accent: string; texture: 'dots' | 'grain' | 'lines' | 'grid' | 'none'; border: number; shadow: boolean; tape: string; shapes: string[]; why: string };
/** subject: who or what the shot is about (an object or place insert carries the story between people shots); who/contact/support/fallback: a painted frame's exact cast, touch, footing and its safer substitute. */
export type Shot = { look?: Look; pulse: boolean; frame: number; subject: 'people' | 'object' | 'place'; shows: string; who: string[]; contact: string; support: string; fallback: string; key?: boolean; simple?: string; floor?: string; mode: 'cutout' | 'painted'; set: string; layout: Layout; zoom: [number, number]; focus: [number, number]; wash: string; weather: 'snow' | 'leaves' | 'none'; actors: Actor[]; props: Prop[]; transition: 'cut' | 'warp' | 'dissolve' | 'ripple' | 'liquid' };
export type Spec = { look: Look; sets: { id: string; place: string; shows: string }[]; sprites: { id: string; who: string[]; shows: string }[]; shots: Shot[] };

/** A shot's horizontal room: the lyric third is left to the words, so cut-outs centred in it move to the edge of the rest. */
/** Smallest figure that still reads as a person on a phone screen (a wide shot's 0.3 was a speck on the bridge). */
export const MIN_FIGURE = 0.4;

/** A close figure is cropped at the feet, never at the head: its top stays inside the frame. */
export const headIn = (q: { ground: number; h: number }) => ({ ...q, ground: Math.max(q.ground, q.h + 0.04) });

/** Window widths in units of its height (page.js draws the same); full-width forms are not in it. */
const WIDE_K: Record<string, number> = { rect: 1.5, rounded: 1.5, polaroid: 1.07, window: 1.25, ticket: 1.6, phone: 0.52, ellipse: 1.6, arch: 0.78, panels: 1.9, torn: 1.5, brush: 1.6, cloud: 1.4, wavy: 1.5 };
/**
 * A window kept wholly out of the lyric third (its edge, not just its centre: a wide ticket centred off the lyric still
 * ran under it), shrunk when it cannot fit beside it. Full-width forms and the whole page are left as they are.
 */
export const windowOff = (l: Layout, side: 'left' | 'right'): Layout => {
  if (['full', 'band', 'doubleband', 'filmstrip', 'split'].includes(l.shape)) return l;
  const k = WIDE_K[l.shape] ?? 1, room = 1 - 0.36 - 0.03;
  const size = Math.min(l.size, (room * 1920) / (k * 1080));
  const half = (k * size * 1080) / 1920 / 2;
  const lo = side === 'left' ? 2 * (0.36 + half) - 1 : -1 + 2 * (0.03 + half), hi = side === 'left' ? 1 - 2 * (0.03 + half) : 1 - 2 * (0.36 + half);
  return { ...l, size, x: Math.min(hi, Math.max(lo, l.x)) };
};

/** A keyed cut-out shaped wrong for what it is (a smear or ground band picked instead of the thing): drawn again. */
export const oddCutout = (aspect: number, person: boolean) => (person ? aspect > 1.3 || aspect < 0.15 : aspect > 3.5 || aspect < 0.28);

/** Windows wide enough for a painted frame with people in it; a narrow one (diamond, circle, keyhole…) cut them off. */
export const WIDE = ['full', 'rect', 'rounded', 'polaroid', 'ticket', 'band', 'doubleband', 'filmstrip', 'window', 'torn', 'brush', 'wavy', 'ellipse', 'split', 'panels'];
export const paintedWindow = (l: Layout, motifs: string[]): Layout => (WIDE.includes(l.shape) ? l : { ...l, shape: (motifs.find((m) => WIDE.includes(m) && m !== 'full') ?? 'rounded') as Layout['shape'], size: Math.max(l.size, 0.62) });

/**
 * Whether a song is calm by how many characters it sings a second (typeplan.mts's measure: 三年後的大雪 2.5 is calm,
 * a rap 5+ is not). Beat trackers read slow songs at double time (大雪 came out 119 BPM), so tempo alone misleads.
 */
export const calmSong = (cues: { text: string; start: number; end: number }[]) => {
  const sung = cues.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
  return cues.reduce((a, c) => a + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sung) < 3;
};

/** A calm song's page does not bounce to the beat and its camera barely moves. */
export const calmShot = (s: Shot): Shot => ({ ...s, pulse: false, zoom: [s.zoom[0], Math.min(s.zoom[1], s.zoom[0] + 0.05)] });

export const offLyric = (x: number, side: 'left' | 'right') => (side === 'left' ? Math.max(x, -0.2) : Math.min(x, 0.2));

/** Whether two figures of a shot overlap by more than a fifth of the narrower one (their boxes at full size). */
export function overlapping(actors: Actor[], aspects: Record<string, number>) {
  const span = (q: Actor) => { const w = (q.h * Math.max(aspects[q.sprite] ?? 0.4, q.then ? aspects[q.then] ?? 0.4 : 0) * 1080) / 1920; return [q.x - w, q.x + w]; };
  return actors.some((p, i) => actors.slice(i + 1).some((q) => {
    const [a0, a1] = span(p), [b0, b1] = span(q);
    return Math.min(a1, b1) - Math.max(a0, b0) > 0.2 * Math.min(a1 - a0, b1 - b0);
  }));
}

/**
 * Figures placed side by side in the room beside the lyric (their whole width out of the lyric third), apart from each
 * other, shrunk together when they do not fit. Standing into each other read as a fake embrace; two figures are moved
 * apart rather than turned into a painted frame (painting more people is where the image model breaks bodies).
 */
export function arrange(actors: Actor[], aspects: Record<string, number>, side: 'left' | 'right') {
  if (!actors.length) return actors;
  const [lo, hi] = side === 'left' ? [2 * 0.36 - 1, 1 - 0.06] : [-1 + 0.06, 1 - 2 * 0.36];
  const half = (q: Actor) => (q.h * Math.max(aspects[q.sprite] ?? 0.4, q.then ? aspects[q.then] ?? 0.4 : 0) * 1080) / 1920;
  const gap = 0.03, sorted = [...actors].sort((a, b) => a.x - b.x);
  const widths = sorted.reduce((t, q) => t + 2 * half(q), 0);
  const k = Math.min(1, (hi - lo - gap * (sorted.length - 1)) / widths);
  const out = sorted.map((q) => ({ ...q, h: q.h * k }));
  let edge = lo;
  for (const q of out) { q.x = Math.max(q.x, edge + half(q)); edge = q.x + half(q) + gap; }
  const over = edge - gap - hi;
  if (over > 0) for (const q of out) q.x -= over;
  return out;
}

/** The code layer of one cut-out shot: the spec in, a canvas drawing out (graphics.ts runs it as `(ctx, f)`). */
const PAGE_JS = readFileSync(new URL('./page.js', import.meta.url), 'utf8');

/** The pose change of a shot moved onto the nearest downbeat (a fraction of the shot), so a fast song's figures move on the beat. */
export const onBeat = (at: number, start: number, dur: number, downbeats: number[]) => {
  const t = start + at * dur, near = downbeats.filter((b) => b > start + 0.3 && b < start + dur - 0.3).sort((x, y) => Math.abs(x - t) - Math.abs(y - t))[0];
  return near == null ? at : (near - start) / dur;
};

export function shotCode(s: Shot, dur: number, aspects: Record<string, number>) {
  const spec = { ...s, dur, aspects };
  return `const S=${JSON.stringify(spec)};
const W=f.w,H=f.h,a=f.age,E=x=>x<=0?0:x>=1?1:x*x*(3-2*x),p=E(a/S.dur);
const z=S.zoom[0]+(S.zoom[1]-S.zoom[0])*p;
const kick=S.pulse&&f.beat?0.022*f.beat.pulse:0;
const cam=(k)=>{const zz=(1+(z-1)*k)*(1+kick*k);ctx.translate(W/2,H/2);ctx.scale(zz,zz);ctx.translate(-W/2-S.focus[0]*W/2*(1-1/zz),-H/2+S.focus[1]*H/2*(1-1/zz));};
const L=S.layout||{shape:'full'},K=S.look||{};
${PAGE_JS}
drawPage(ctx,W,H,L,K,f.scene(S.set),z,cam,S.actors.length?Math.min(...S.actors.map(q=>q.ground)):0,S.frame);
ctx.save();cam(1);
const props=(front)=>S.props.forEach((q,i)=>{if(!!q.front!==front)return;const pic=f.img(q.sprite);if(!pic)return;const hh=q.h*H,ww=hh*(S.aspects[q.sprite]||1);let x=(q.x+1)/2*W+(q.walk||0)*W*p,y=q.y*H,rot=0;
 if(q.motion==='fall'){const k=E(a/Math.min(S.dur,4));y-= (1-k)*H*0.55;x+=Math.sin(a*2.2+i)*40*(1-k);rot=Math.sin(a*1.7+i)*0.6*(1-k);}
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);
 if(q.motion==='flutter')f.warp(pic,-ww/2,-hh/2,ww,hh,[{kind:'flutter',pin:'left'}],i);else if(q.motion==='hang')f.warp(pic,-ww/2,-hh/2,ww,hh,[{kind:'sway',pin:'top',amp:0.03}],i);else ctx.drawImage(pic,-ww/2,-hh/2,ww,hh);
 ctx.restore();});
props(false);
if(S.floor){const w=[...S.floor],g=Math.min((S.actors.length?Math.min(...S.actors.map(q=>q.ground)):0.86)*H+H*0.05,H*0.83),size=Math.min(260,W*0.5/w.length);
 const span=w.length*size*0.95,x0=W/2-span/2+size*0.47,ink=(S.look&&S.look.accent)||'#e8402a';
 const bodies=S.actors.map(q=>{const ww=q.h*H*(S.aspects[q.sprite]||0.4);return [(q.x+1)/2*W,ww/2];});
 w.forEach((ch,i)=>{const fall=E((a-0.15-i*0.12)/0.5);if(fall<=0)return;let x=x0+i*size*0.95,dx=0,rot=0;
  for(const [bx,bw] of bodies){const d=x-bx,reach=bw+size*0.4;if(Math.abs(d)<reach){const push=(reach-Math.abs(d))*Math.sign(d||1);dx+=push*0.9;rot+=push/reach*0.5;}}
  ctx.save();ctx.translate(x+dx,g-(1-fall)*H*0.6);ctx.transform(1,0,-0.55,0.42,0,0);ctx.rotate(rot*0.4);
  ctx.globalAlpha=0.85*fall;ctx.fillStyle=ink;ctx.font='900 '+size+'px "Noto Sans TC","Hiragino Sans",sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(ch,0,0);ctx.restore();});}
S.actors.forEach((q,i)=>{const k=E(a/Math.min(0.9,S.dur*0.2)),sw=q.then?(a>=q.at*S.dur?1:0):0;
 [[q.sprite,1-sw],[q.then,sw]].forEach(([id,o],j)=>{if(!id||o<=0.001)return;const pic=f.img(id);if(!pic)return;const hh=q.h*H,ww=hh*(S.aspects[id]||0.4);
 let x=(q.x+1)/2*W,y=q.ground*H,al=o;
 if(q.enter==='fade')al*=k;
 if(q.ground<1){ctx.save();ctx.globalAlpha*=al*0.22;ctx.fillStyle=K.ink||'#1B1F4A';ctx.beginPath();ctx.ellipse(x,y-hh*0.01,ww*0.42,hh*0.025,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 ctx.save();ctx.globalAlpha*=al;ctx.translate(x,y);if(q.flip)ctx.scale(-1,1);ctx.scale(1,1+0.003*Math.sin(a*1.6+i*2));
 if(q.wind)f.warp(pic,-ww/2,-hh,ww,hh,[{kind:'flutter',rect:[0,0.62,1,1],pin:'top',amp:0.02}],i);else ctx.drawImage(pic,-ww/2,-hh,ww,hh);
 ctx.restore();});});
props(true);
ctx.restore();
if(S.weather==='snow')f.particles({shape:'snow',count:110,color:'#FFFFFF',size:5,speed:70,sway:0.5,opacity:0.9,seed:3});
if(S.weather==='leaves')f.particles({shape:'leaf',count:16,color:['#E8402A','#F08A2C'],size:14,speed:45,sway:0.8,opacity:0.9,seed:5});
if(S.wash){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=0.18;ctx.fillStyle=S.wash;ctx.fillRect(0,0,W,H);ctx.restore();}`;
}

const VERIFY_SCHEMA = { type: 'object', additionalProperties: false, required: ['seen', 'checks', 'problems'], properties: {
  seen: { type: 'string' },
  checks: { type: 'object', additionalProperties: false, required: ['cast', 'identity', 'anatomy', 'contact', 'support', 'single'], properties: Object.fromEntries(['cast', 'identity', 'anatomy', 'contact', 'support', 'single'].map((k) => [k, { type: 'string', enum: ['pass', 'fail', 'uncertain'] }])) },
  problems: { type: 'string' },
} };
/**
 * A painted frame checked the way a buyer would look at it (the image model breaks bodies where people meet: a hand
 * from nowhere, the same woman twice, two heads swapped, a man sitting on handlebars). Each check passes, fails or is
 * uncertain; anything but a pass on all of them is a fail.
 */
export type Verdict = 'pass' | 'fail' | 'uncertain';

const HAND_SCHEMA = { type: 'object', additionalProperties: false, required: ['people', 'hands'], properties: {
  people: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['who', 'hands'], properties: { who: { type: 'string' }, hands: { type: 'integer' } } } },
  hands: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tile', 'whose', 'fingers', 'status', 'problem'], properties: { tile: { type: 'integer' }, whose: { type: 'string' }, fingers: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'uncertain'] }, problem: { type: 'string' } } } },
} };

/**
 * The second, independent hand reader (another vendor's model): on the pictures people sent back it caught three of
 * the four bad hands the Opus reading let through, so a hand passes only when both readers pass it.
 */
/**
 * At most `n` calls at once (a song's pictures checked all together hit the image API's rate limit, and a refused
 * call read as a doubt).
 */
export function limiter(n: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T,>(job: () => Promise<T>): Promise<T> => {
    if (running >= n) await new Promise<void>((go) => waiting.push(go));
    running++;
    try { return await job(); } finally { running--; waiting.shift()?.(); }
  };
}
const geminiSlot = limiter(6);

export async function geminiHands(file: string): Promise<{ status: Verdict; problems: string }> {
  const m = await sharp(file).metadata(), grid = m.height! > m.width! ? tiles(2, 3) : tiles(3, 2);
  const cut = async ([x0, y0, x1, y1]: number[]) => (await sharp(file).extract({ left: Math.round(x0 * m.width!), top: Math.round(y0 * m.height!), width: Math.round((x1 - x0) * m.width!), height: Math.round((y1 - y0) * m.height!) }).resize(900, 900, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()).toString('base64');
  const full = (await sharp(file).resize(1100, 1100, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer()).toString('base64');
  const parts = await Promise.all(grid.map(cut));
  for (let k = 0; k < 4; k++) try {
    const r = await geminiSlot(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.generateContent({ model: 'gemini-3.8-flash', contents: [{ role: 'user', parts: [
      { text: 'Whole picture:' }, { inlineData: { mimeType: 'image/jpeg', data: full } },
      ...parts.flatMap((d, i) => [{ text: `Tile ${i} (enlarged):` }, { inlineData: { mimeType: 'image/jpeg', data: d } }]),
      { text: 'Check every visible hand in this illustration for mistakes. For each hand count the fingers including the thumb. A hand is BAD if an open or relaxed hand has fewer or more than 5 fingers (4 is bad, also in anime style), fingers fuse, or the hand is not joined to an arm; also BAD if any person has more than 2 hands in total. Answer JSON only: {"bad": true|false, "unsure": true|false, "why": "short"}' },
    ] }], config: { responseMimeType: 'application/json' } }));
    const j = JSON.parse(r.text ?? '{}') as { bad?: boolean; unsure?: boolean; why?: string };
    return { status: j.bad ? 'fail' : j.unsure ? 'uncertain' : 'pass', problems: j.bad || j.unsure ? j.why ?? '' : '' };
  } catch {
    await new Promise((r) => setTimeout(r, 2000 * (k + 1) + Math.random() * 1000));
  }
  return { status: 'uncertain', problems: 'the second hand check could not be read' };
}

/**
 * The hand check of the pipeline: a flag for a person, never a redraw. Measured against 154 pictures people labelled
 * (bench-hands.mts, 2026-10-25): the close Gemini reading caught 4 of 5 bad hands but failed 71 of 149 good ones and
 * changed its mind on 35; the Opus tile reading caught 1 of 5 at $0.05 a picture; asked only for mistakes a viewer
 * would notice, Gemini caught none. Redrawing on every hand flag sent half the good pictures back, so a flagged hand
 * is shown first on the review page and a person decides.
 */
export async function handGate(file: string) {
  const g = await geminiHands(file);
  return { status: (g.status === 'pass' ? 'pass' : 'uncertain') as Verdict, problems: g.status === 'pass' ? '' : `hands (please look): ${g.problems}`, usd: 0 };
}

/** Overlapping tiles covering a picture (fractions x0, y0, x1, y1): `cols` × `rows`, each reaching a quarter into its neighbours. */
export function tiles(cols: number, rows: number, overlap = 0.25) {
  const w = 1 / cols, h = 1 / rows;
  return Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return [Math.max(0, (c - overlap) * w), Math.max(0, (r - overlap) * h), Math.min(1, (c + 1 + overlap) * w), Math.min(1, (r + 1 + overlap) * h)];
  });
}

/**
 * The hands of a picture, read close up: a whole-picture check missed a missing little finger, four-finger hands and a
 * third hand holding betel nuts while the arms were crossed, and boxes the model drew around hands mostly missed them.
 * The picture is cut into overlapping enlarged tiles that every hand falls wholly inside one of; each hand is read
 * there, and each person's hand count is read on the whole picture.
 */
export async function handCheck(file: string): Promise<{ status: Verdict; problems: string; usd: number }> {
  const m = await sharp(file).metadata(), portrait = m.height! > m.width!;
  const grid = portrait ? tiles(2, 3) : tiles(3, 2);
  const cut = (b: number[]) => {
    const [x0, y0, x1, y1] = b, left = Math.round(x0 * m.width!), top = Math.round(y0 * m.height!);
    return sharp(file).extract({ left, top, width: Math.round((x1 - x0) * m.width!), height: Math.round((y1 - y0) * m.height!) }).resize(900, 900, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
  };
  const full = (await sharp(file).resize(1100, 1100, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer()).toString('base64');
  const parts = await Promise.all(grid.map(async (b) => (await cut(b)).toString('base64')));
  const msg = await new Anthropic({ maxRetries: 8 }).messages.create({ model: 'claude-opus-5-5', max_tokens: 4000, messages: [{ role: 'user', content: [
    { type: 'text', text: 'Whole picture:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: full } },
    ...parts.flatMap((data, i) => [{ type: 'text', text: `Tile ${i} (enlarged, overlaps its neighbours):` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }]),
    { type: 'text', text: `You check an illustration for hand mistakes a viewer would notice.
people: for each person in the whole picture, how many hands they have in total (count every hand, also hands holding things or tucked under crossed arms; a hand you only infer but cannot see does not count).
hands: every hand you can see in the tiles (when one appears in several tiles, report it from the tile where it is most complete). fingers = the number you count (thumb included), or "hidden" when the pose naturally hides some (a fist, a grip around an object, fingers behind something). status fail when an open or relaxed hand has fewer or more than five fingers (four fingers is a fail, also in anime style), fingers fuse into a blob or bend impossibly, or the hand is not joined to a wrist and arm; uncertain only when the hand is too small or blurred to read even enlarged; otherwise pass. problem: one short sentence (empty when pass).` },
  ] }], output_config: { format: { type: 'json_schema', schema: HAND_SCHEMA } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  const usd = (msg.usage.input_tokens * 5 + msg.usage.output_tokens * 25) / 1e6;
  try {
    const r = JSON.parse((msg.content.find((c) => c.type === 'text') as { text: string }).text) as { people: { who: string; hands: number }[]; hands: { tile: number; whose: string; fingers: string; status: Verdict; problem: string }[] };
    const extra = r.people.filter((p) => p.hands > 2).map((p) => `${p.who} has ${p.hands} hands`);
    const bad = r.hands.filter((h) => h.status === 'fail').map((h) => `${h.whose}: ${h.problem || `${h.fingers} fingers`}`);
    const doubt = r.hands.filter((h) => h.status === 'uncertain').map((h) => `${h.whose}: ${h.problem || 'unclear'}`);
    const status: Verdict = extra.length || bad.length ? 'fail' : doubt.length ? 'uncertain' : 'pass';
    return { status, problems: [...extra, ...bad, ...doubt].join('; '), usd };
  } catch {
    return { status: 'uncertain', problems: 'hands could not be read', usd };
  }
}
/** One checked picture, kept for the review page and the error set (out/qa-set). */
export type QaEntry = { kind: 'pose' | 'paint'; id: string; file: string; status: Verdict | 'substitute' | 'dropped'; problems: string[]; tries: number };

export async function verify(file: string, castSheet: string, people: { id: string; look: string }[], contact: string, support: string, scene = ''): Promise<{ pass: boolean; status: Verdict; problems: string; usd: number }> {
  if (!people.length) return verifyBody(file, castSheet, people, contact, support, scene);
  // the body and the hands are read separately (hands too small to read in the whole picture)
  const [body, hands] = await Promise.all([verifyBody(file, castSheet, people, contact, support, scene), handGate(file)]);
  const status: Verdict = body.status === 'fail' || hands.status === 'fail' ? 'fail' : body.status === 'uncertain' || hands.status === 'uncertain' ? 'uncertain' : 'pass';
  return { pass: status !== 'fail', status, problems: [body.problems, hands.status !== 'pass' ? hands.problems : ''].filter(Boolean).join('; '), usd: body.usd + hands.usd };
}

async function verifyBody(file: string, castSheet: string, people: { id: string; look: string }[], contact: string, support: string, scene = '') {
  const b64 = async (f: string) => (await sharp(f).resize(1280).jpeg({ quality: 85 }).toBuffer()).toString('base64');
  const msg = await new Anthropic({ maxRetries: 8 }).messages.create({ model: 'claude-opus-5-5', max_tokens: 4000, messages: [{ role: 'user', content: [
    { type: 'text', text: 'Picture to check:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await b64(file) } },
    ...(people.length ? [{ type: 'text', text: 'Character sheet:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await b64(castSheet) } }] : []),
    { type: 'text', text: `You check frames of a paid music video for mistakes a viewer would notice as AI errors. First describe what you actually see (seen), person by person, before comparing to the brief.
The picture must show exactly these people and nobody else: ${people.length ? people.map((p) => `${p.id} (${p.look})`).join('; ') : 'nobody at all'}.${contact ? ` Intended contact: ${contact}.` : ''}${support ? ` Intended footing: ${support}.` : ''}${scene ? ` Intended scene: ${scene} (a change of clothes or accessories this scene describes, such as a swapped cap, is intended, not an identity error).` : ''}
checks (pass / fail / uncertain each):
- cast: exactly the listed people, no extra people anywhere (background included), nobody missing.
- identity: each person matches the character sheet (face, hair, clothes); no head on the wrong body, no two people's features swapped.
- anatomy: every visible hand traces to a wrist and arm and that arm to a shoulder of the same person; no extra or floating limbs, merged bodies, wrong finger counts or broken joints.
- contact: who touches whom matches the intended contact (which hand, left or right, does not matter: a viewer does not notice); no body passing through another or through objects.
- support: every person's weight rests on something plausible (feet on ground, seat on a seat); nobody sits on handlebars, floats or stands on nothing. When a person's feet and seat are outside the picture (a close or waist-up shot), support passes for them.
- single: the same person does not appear twice; and pairs match: both shoes the same kind and colour, both earrings alike, gloves both on or both off (a flip-flop on one foot and a heel on the other is a fail).
Use uncertain whenever you cannot tell. problems: the failures in one short English sentence each (empty if none).` },
  ] }], output_config: { format: { type: 'json_schema', schema: VERIFY_SCHEMA } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  const usd = (msg.usage.input_tokens * 5 + msg.usage.output_tokens * 25) / 1e6;
  try {
    const r = JSON.parse((msg.content.find((c) => c.type === 'text') as { text: string }).text) as { checks: Record<string, string>; problems: string };
    const vs = Object.values(r.checks) as Verdict[];
    // a clear fault is drawn again; a doubt is kept for a person to look at (redrawing every doubt replaced good
    // pictures: which hand holds which was enough to send six frames of a song to their substitutes)
    const status: Verdict = vs.includes('fail') ? 'fail' : vs.includes('uncertain') ? 'uncertain' : 'pass';
    const problems = status === 'pass' ? '' : r.problems || Object.entries(r.checks).filter(([, v]) => v !== 'pass').map(([k, v]) => `${k} ${v}`).join(', ');
    return { pass: status !== 'fail', status, problems, usd };
  } catch {
    return { pass: true, status: 'uncertain' as Verdict, problems: 'the check could not be read', usd };
  }
}

/**
 * The pose schedule: a character never holds the same pose two shots running, and the least-used pose of theirs that
 * the last shot did not show takes its place (12 poses for 34 shots had two of them on screen 18 times each).
 */
export function diversify(shots: Shot[], sprites: { id: string; who: string[] }[]) {
  const used = new Map<string, number>();
  const ownerOf = (id: string) => sprites.find((x) => x.id === id)?.who[0] ?? '';
  let prev = new Set<string>();
  return shots.map((s) => {
    const now = new Set<string>();
    const actors = s.actors.map((q) => {
      const owner = ownerOf(q.sprite);
      const mine = sprites.filter((x) => x.who[0] === owner && owner).map((x) => x.id);
      const pick = (id: string, avoid: Set<string>) => (!avoid.has(id) ? id : [...mine].filter((m) => !avoid.has(m)).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0] ?? id);
      const sprite = pick(q.sprite, prev);
      const then = q.then ? pick(q.then, new Set([...prev, sprite])) : '';
      for (const id of [sprite, then].filter(Boolean)) { used.set(id, (used.get(id) ?? 0) + 1); now.add(id); }
      return { ...q, sprite, then };
    });
    prev = now;
    return { ...s, actors };
  });
}

const str = { type: 'string' }, num = { type: 'number' };
const obj = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  look: obj({ paper: str, ink: str, accent: str, texture: { type: 'string', enum: ['dots', 'grain', 'lines', 'grid', 'none'] }, border: num, shadow: { type: 'boolean' }, tape: str, shapes: { type: 'array', items: str }, why: str }),
  sets: { type: 'array', items: obj({ id: str, place: str, shows: str }) },
  sprites: { type: 'array', items: obj({ id: str, who: { type: 'array', items: str }, shows: str }) },
  shots: { type: 'array', items: obj({
    frame: { type: 'integer' }, subject: { type: 'string', enum: ['people', 'object', 'place'] }, shows: str, who: { type: 'array', items: str }, contact: str, support: str, fallback: str, key: { type: 'boolean' }, simple: str, floor: str, mode: { type: 'string', enum: ['cutout', 'painted'] }, set: str,
    layout: obj({ shape: str, x: num, y: num, size: num, paper: str, tilt: num }),
    zoom: { type: 'array', items: num }, focus: { type: 'array', items: num }, wash: str, weather: { type: 'string', enum: ['snow', 'leaves', 'none'] },
    actors: { type: 'array', items: obj({ sprite: str, then: str, at: num, x: num, ground: num, h: num, flip: { type: 'boolean' }, enter: { type: 'string', enum: ['none', 'fade'] }, wind: { type: 'boolean' } }) },
    props: { type: 'array', items: obj({ sprite: str, x: num, y: num, h: num, motion: { type: 'string', enum: ['still', 'fall', 'flutter', 'hang'] }, front: { type: 'boolean' }, walk: num }) },
    transition: { type: 'string', enum: ['cut', 'warp'] }, pulse: { type: 'boolean' },
  }) },
});

async function main() {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, keyframes: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' }, 'image-model': { type: 'string', default: 'gemini-3.1-flash-image' }, 'keep-look': { type: 'string' }, recheck: { type: 'boolean' } } });
  for (const line of readFileSync(join(homedir(), '.config/vjflow/anthropic.env'), 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
  const kf = a.keyframes!, out = a.out!, from = +a.from!, to = +a.to!;
  mkdirSync(join(out, 'spr'), { recursive: true });
  const song = JSON.parse(readFileSync(a.song!, 'utf8'));
  const board = JSON.parse(readFileSync(join(kf, 'board.json'), 'utf8')) as Board;
  const all = frameTimes(board, song.cues, 0, song.duration ?? Math.max(...song.cues.map((c: { end: number }) => c.end)) + 8);
  // each keyframe's own section (keyframes.mts names its picture kf_N) gives its real start and end: a passage's
  // first frame opens at the passage start, not at its line
  const tr = JSON.parse(readFileSync(join(kf, 'treatment.json'), 'utf8'));
  const secs = tr.graphics.sections as { start: number; layers: { kind: string; asset?: string }[]; transition?: unknown }[];
  const kfAt = (n: number) => secs.findIndex((x) => x.layers.some((l) => l.kind === 'photo' && l.asset === `kf_${n}`));
  const shots = all.map((f, i) => ({ ...f, n: i + 1 })).flatMap((f) => {
    const k = kfAt(f.n);
    return k < 0 ? [] : [{ ...f, start: secs[k].start, end: secs[k + 1]?.start ?? f.end }];
  }).filter((f) => f.end > from + 0.05 && f.start < to - 0.05);
  let usd = 0;
  const calm = calmSong(song.cues);
  const perSec = song.cues.reduce((x: number, c: { text: string }) => x + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, song.cues.reduce((x: number, c: { start: number; end: number }) => x + Math.max(0, c.end - c.start), 0));
  const lyricOf = (f: { cue: string }) => song.cues.find((c: { id: string }) => c.id === f.cue)?.text ?? '';
  // a repeated line (a chorus coming back) points at the frame it first appeared in
  const repeatOf = (f: { cue: string; n: number }) => all.map((x, i) => ({ ...x, n: i + 1 })).find((x) => x.n < f.n && lyricOf(x) && lyricOf(x) === lyricOf(f))?.n ?? 0;

  // the page languages of the last songs, so a new one does not repeat them
  const historyFile = 'out/page-history.json';
  const history: { song: string; shapes: string[]; texture: string }[] = (existsSync(historyFile) ? JSON.parse(readFileSync(historyFile, 'utf8')) : []).filter((h: { song: string }) => h.song !== song.title);
  const keptLook = a['keep-look'] ? (JSON.parse(readFileSync(a['keep-look'], 'utf8')) as Spec).look : undefined;
  const specFile = join(out, 'spec.json');
  if (!existsSync(specFile)) {
    const prompt = `你是 MV 美術指導。下面是〈${song.title}〉已經定好的分鏡（每格一句歌詞）。這次不要每格畫一張完整插畫，改成設計感的「舞台」：少數幾張平面設計背景（沒有人），加上去背的人物和道具立繪，每格用程式擺放、移動。
${lessonsText() ? `過去作品的使用者回饋整理出的經驗（一定要遵守）：\n${lessonsText()}\n` : ''}規則：
最近其他歌用過的版面語言：${JSON.stringify(history.slice(-6))}
${keptLook ? `這首的 look 已經定好（使用者認可過），照抄不要改：${JSON.stringify(keptLook)}\n` : ''}- 背景（sets）：每個地點最多 2 張（例如遠景、近景），全部共用；描述用英文，寫清楚構圖：大面積平塗色塊或留白的紙、簡化的幾何形、地平線或地面在畫面下方 1/4 左右讓人物站；不要人。
- 立繪（sprites）：主角每人約 格數÷3 個姿勢（整首 30 多格就要 10–12 個），配角 6–8 個，短段落按比例減少；道具最多 4 個。每個姿勢的輪廓、朝向、手勢、表情都要明顯不同（左右翻轉、放大縮小不算新姿勢）。分配時先想每格這個人在做什麼（表演、聆聽、調侃、拒絕、驚訝、邀請、轉折、收尾），再決定需要哪些姿勢。相鄰兩格同一人不能用同一個姿勢，五格內同一姿勢最多兩次。每張只畫一個人或一個東西，英文描述姿勢、表情、手上拿什麼（道具在誰手上、圍巾戴著還是拿著，要和劇情一致）。立繪和背景分開畫、對不準：姿勢必須自己站得住（站、走、轉身、低頭、伸手、回頭），不要靠欄杆、倚牆、坐椅子這種要靠背景東西的姿勢。who 填人物 id（道具填 []）。
- subject：每格先決定畫面主角是 people（人物）、object（物體特寫）或 place（場景空鏡）。整首約 ${calm ? '30–40%（慢歌：只有場景、或場景加幾樣物品的畫面最能留住氣氛，可以有純背景的空鏡）' : '20–30%'} 的格用 object/place 穿插（上限 40%；關鍵動作和情緒反應的格一定要有人物，無人鏡頭只放在轉場、氣氛和交代前因後果的地方），放在：前奏或第一次進入新地點（攤位亮燈、路口）、動作的前因後果（手機震動、兩杯飲料、機車鑰匙、車燈亮起）、主歌轉副歌或間奏（霓虹倒影、音箱）、情緒轉折（沒喝完的飲料、空座位）、結尾回到開場的地方。用「人物意圖 → 物件／環境變化 → 人物反應」銜接，物體要是故事裡的東西，同一個母題（同一個攤位、同一條路）在不同時間反覆出現。object/place 格：mode 用 painted，actors 空，shows 用英文寫這個畫面（不能有人），who 空。
- 只有兩個人的身體真的碰在一起（擁抱、牽手、親吻、靠在對方身上）或特寫身體局部的格，mode 用 painted（整張畫）；說話、對看、指著對方、遞東西、一起站著都用 cutout，兩人分開站、姿勢互相回應。people 的 painted 格規則（生圖最容易畫錯人體，付費產品絕對不能出錯）：who 最多 2 人；畫面裡除了這 2 人不能有任何其他人（沒有路人、人群、背景人物）；不畫手碰臉或遮眼睛、三人以上互動、抱起人、多人疊在一起；共騎機車容易畫錯，改用 object 鏡頭（車燈亮起、車子遠去）表現。shows 用英文寫清楚構圖；contact 寫誰的哪隻手碰誰的哪裡（沒有就空字串）；support 寫每個人的重量靠什麼（站在地上、坐在椅子上）；fallback 用英文寫一個不畫人也能交代同一件事的鏡頭（物體或場景）。key：這格是不是故事少了就看不懂的關鍵事件（相遇、擁抱、分離、告別、和好、結局）；key 為 true 的格不能被換成無人鏡頭。simple 用英文寫同一個動作的簡化構圖，讓看得到的手越少越好，但動作仍看得懂（擁抱→側後方近景、臉靠在肩上、手藏在對方身後；戴帽→只見帽子落在頭上和兩人的笑臉；依偎→兩人肩靠肩的背影）。所有 people 的 painted 格都用「手越少越好」的構圖：接觸用身體、頭、肩膀表現，手藏在對方身後、口袋裡或畫面外。cutout 格的 who、contact、support、fallback 填空字串或空陣列，shows 簡短描述即可。整段 painted（含 object/place）不超過一半。
- 每格：x 是人物或道具中心（-1 左到 1 右），ground 是人物腳底高度、道具的 y 是道具中心高度（都是 0 頂到 1 底；人物通常 0.85–0.95），h 是高度占畫面比例（遠景 0.4、中景 0.6、近景可 0.9 以上讓腳在畫面外）。人物和道具都放在歌詞那一側以外的三分之二（歌詞在 side 那側）。
- 去背人物不會走路也不會滑動：用姿勢表達動作。每個人物一格內可以換一次姿勢（then 填第二個立繪 id、at 是換的時間點占這格的比例 0.3–0.7；不換就 then 填空字串），用來表現表情或動作的變化（笑→驚慌、抬頭→低頭）。同一個立繪只能在情緒相同的格重複用，情緒變了就畫新的姿勢和表情。走路的格改成站定的姿勢或 painted。換姿勢依樂句和動作需要（唱到指、擺手、喝、比讚就換成那個動作），不需要每格都換。enter 用 fade 淡入（第一次出現時），人物從不滑入。兩個人同框時，兩人的姿勢都要回應對方：視線看向對方、一個人動作時另一個人也有反應（笑著回看、伸手回應），不能一人直視觀眾；兩人各自的 then 姿勢要一起設計。換姿勢的兩張立繪要同樣的身體朝向、站位和比例（頭和腳的位置一樣），只改手、頭的角度和表情。wind（風吹衣襬、圍巾時 true）；道具要跟它所在的東西一起出現：綁在欄杆上、掛在樹上、放在桌上的道具不能單獨浮在畫面裡，那格用 painted（整張畫）。道具不是主角：高度不超過畫面 0.3，同一個道具不要在連續好幾格都當畫面中心。道具 motion：fall 只在落下的東西（落葉）、flutter 用在被風吹的布、hang 掛著擺動、其他 still；front=true 畫在人物前面（擋住人的人群、前景的樹枝或欄杆），walk 是整格水平移動量（人群穿過畫面用 ±0.2）。人群要把兩人隔開時，用 front 的人群從兩人之間穿過。
- floor：大約四格裡挑一格（有地面、有人物站著的 cutout 格），把這句唱到的一個關鍵詞（1–4 個字，例如「一發」「台妹」「大雪」）寫進場景：字會一個個掉下來平貼在地面上，人物站的地方字會被推開。其他格填空字串；不要連續兩格都用。
- look 是這首歌自己的版面語言（每首都要不一樣，從這首的歌詞意思和畫風來）：paper 紙色、ink 墨色（線條、網點、地平線）、accent 強調色、texture 紙的紋理（dots 網點、grain 顆粒、lines 筆記本橫線、grid 方格、none 無）、border 窗框線粗細 px（0 無框、4–12）、shadow 是否有錯位印刷的色塊影子、tape 膠帶色（空字串＝不用）、shapes 是這首反覆使用的 3–4 種窗形（母題），why 寫為什麼這些形狀和質感適合這首（對應到歌詞裡的什麼）。可用的窗形：circle 圓、ellipse 橢圓、rect 方框、rounded 圓角框、arch 拱門、diamond 菱形、hexagon 六角、flower 五瓣花、keyhole 鑰匙孔、cloud 雲邊、wavy 波浪邊、torn 撕紙邊、brush 毛筆邊、ticket 票根、polaroid 拍立得、filmstrip 膠捲、window 窗格、phone 手機、band 橫色帶、doubleband 雙色帶、split 斜切分割、panels 三格漫畫分格、full 整頁。不要選和下面「最近用過」一樣的組合。
- layout 是這格的版面（大面積紙色留白、場景放在一個窗形裡、人物站在窗形前面壓過邊緣、一條地平線）：shape 從這首的 shapes 裡選（必要時偶爾用別的），同一意義用同一形狀當母題（例如回憶都用同一種窗），相鄰格換形狀、位置或大小；full 只留給情緒最高點的 1–2 格。形狀放在歌詞那側以外（x 中心 -1..1、y 中心 0 頂到 1 底、size 是形狀高度占畫面比例 0.45–0.85；band/doubleband/filmstrip 橫跨全寬、split 用 x 決定切線位置）；tilt 是傾斜角度（拍立得、票根、照片可 -6..6，其他 0）。cutout 格的人物站在窗形前面，腳在地平線上（ground 0.8–0.92），可以超出形狀；paper 可每格換（例如現在冷、回憶暖），空字串就用 look.paper。painted 格的整張畫也放進窗形裡，除非它就是高點的 full。
- zoom [開始, 結束] 介於 1–1.25 慢推，focus [x, y] 推向的位置（-1..1，y 上正）。wash：記憶場景暖色 hex、現在場景冷色或空字串。weather：雪夜 snow、楓葉街 leaves。
- transition：時空切換（現在↔回憶、現實↔想像）用 warp（水波扭曲），其他一律 cut。pulse：快歌或高能量段落（饒舌、副歌、舞曲）true，整個版面跟著大鼓輕跳；慢歌、抒情段落 false。
- 副歌與重複句：分鏡裡 repeats 有值的格（同一句歌詞再出現），用和那一格相同的 shape、位置和人物站位，讓副歌一回來就認得；每次只換姿勢、表情、paper 色或景別。快歌的格很短（2–4 秒），一格只說一件事，不要每格都換窗形：同一段落（section）內窗形可以連續 2–3 格沿用，在段落交界才換。
人物：${JSON.stringify(board.people)}
地點：${JSON.stringify(board.places)}
這首每秒唱 ${perSec.toFixed(1)} 個字，${calm ? '是慢歌、抒情：版面不要跟拍跳動（pulse 一律 false），鏡頭幾乎不動（zoom 只推 0–5%），人物換姿勢只在情緒真的轉變時，讓畫面停得住' : '是快歌：pulse 和換姿勢依段落能量決定（主歌可以穩一點，副歌、饒舌段跟拍）'}。
分鏡：${JSON.stringify(shots.map((f) => ({ frame: f.n, section: (song.sections ?? []).find((x: { start: number; end: number }) => f.start >= x.start - 0.05 && f.start < x.end)?.type ?? '', repeats: repeatOf(f), lyric: song.cues.find((c: { id: string }) => c.id === f.cue)?.text ?? '（間奏）', seconds: +(f.end - f.start).toFixed(1), side: f.side, place: f.place, who: f.who, change: f.change, shows: f.shows })))}`;
    // a whole song's spec outgrew the API's structured-output grammar: the schema goes in the prompt and the answer is
    // parsed and checked here (a cut-off or malformed answer is asked for again, never kept)
    let made: Spec | undefined;
    for (let k = 0; k < 3 && !made; k++) {
      const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 64000, messages: [{ role: 'user', content: `${prompt}\n\n只回傳一個 JSON 物件，不要任何說明文字，格式照這個 JSON Schema：\n${JSON.stringify(SCHEMA)}` }], output_config: { effort: 'high' } } as Anthropic.Messages.MessageStreamParams).finalMessage();
      usd += (msg.usage.input_tokens * 5 + msg.usage.output_tokens * 25) / 1e6;
      const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
      try {
        const m = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Spec;
        if (m.look && m.sets?.length && m.sprites?.length && m.shots?.length) made = m;
        else console.log('spec: incomplete answer, asked again');
      } catch {
        console.log(`spec: unreadable answer (${msg.stop_reason}), asked again`);
      }
    }
    if (!made) throw new Error('spec: no usable answer after three tries');
    if (keptLook) made.look = keptLook;
    writeFileSync(specFile, JSON.stringify(made));
    writeFileSync(historyFile, JSON.stringify([...history, { song: song.title, shapes: made.look.shapes, texture: made.look.texture }], null, 1));
  }
  const spec = JSON.parse(readFileSync(specFile, 'utf8')) as Spec;
  // shape names are checked here, not in the schema (the enum twice made the response grammar too large)
  const known = (x: string) => (SHAPES as readonly string[]).includes(x);
  spec.look.shapes = spec.look.shapes.filter(known);
  for (const s of spec.shots) if (!known(s.layout.shape)) s.layout.shape = (spec.look.shapes[0] ?? 'rect') as Layout['shape'];
  if (calm) spec.shots = spec.shots.map(calmShot);
  console.log(`spec: ${spec.sets.length} sets, ${spec.sprites.length} sprites, ${spec.shots.filter((s) => s.mode === 'painted').length}/${spec.shots.length} painted`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const img = (file: string) => ({ type: 'image', data: readFileSync(file).toString('base64'), mime_type: 'image/jpeg' });
  const draw = async (file: string, text: string, refs: string[], ratio: string) => {
    if (existsSync(file)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let r: any;
    for (let k = 0; k < 3 && !r?.output_image?.data; k++)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model: a['image-model'], input: [{ type: 'text', text }, ...refs.map(img)], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ratio, image_size: '2K' } });
    if (!r?.output_image?.data) throw new Error(`no image for ${file}`);
    writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
    usd += 0.101;
  };
  // the user's own style is followed as they asked; without one the flat poster look keeps the AI sheen down
  const LOOK = board.userStyle
    ? `In this song's style: ${board.style}. Spot colours: ink ${spec.look.ink}, accent ${spec.look.accent}, paper ${spec.look.paper}.`
    : `Flat graphic poster design for this song (${board.style.split('.')[0]}), in its spot colours: ink ${spec.look.ink}, accent ${spec.look.accent}, paper ${spec.look.paper}. Large calm areas of flat colour or bare paper, simplified geometric shapes, halftone dots only in shadows, clean confident edges, very little detail. Designed, not rendered: no glow, no soft gradients, no painterly texture.`;
  const NO_TEXT = 'Absolutely no text, letters, numbers, signs or watermarks anywhere.';
  const cast = join(kf, 'cast.jpg');
  await Promise.all(spec.sets.map((s) => {
    const place = join(kf, `place_${s.place}.jpg`);
    return draw(join(out, `set_${s.id}.jpg`), `A background set for an animated music video, no people. Only the place itself: no stamps, labels, paper clips, tape, photo borders or document frames. ${LOOK}\nThe place (second image shows it): ${s.shows}\nOne continuous full-bleed 16:9 image. ${NO_TEXT}`, [cast, ...(existsSync(place) ? [place] : [])], '16:9');
  }));
  // --recheck: every person picture already drawn is checked again with today's checks; what fails is set aside so
  // the steps below draw it anew (pictures from before a check existed, or that an older check let through)
  if (a.recheck) {
    const people = (who: string[]) => board.people.filter((p) => who.includes(p.id));
    const olds = [
      ...spec.sprites.filter((x) => x.who.length).map((x) => ({ file: join(out, 'spr', `${x.id}.jpg`), png: join(out, 'spr', `${x.id}.png`), who: x.who, scene: x.shows, key: `pose:${x.id}` })),
      ...spec.shots.filter((x) => x.mode === 'painted' && x.subject === 'people').map((x) => ({ file: join(out, `paint_${x.frame}.jpg`), png: '', who: x.who.length ? x.who : shots.find((f) => f.n === x.frame)?.who ?? [], scene: x.shows, key: `paint:${x.frame}` })),
    ].filter((x) => existsSync(x.file));
    const res = await Promise.all(olds.map(async (x) => ({ x, v: await verify(x.file, cast, people(x.who), '', '', x.scene) })));
    for (const { x, v } of res) {
      usd += v.usd;
      if (v.status !== 'fail') continue;
      console.log(`recheck ${x.key}: ${v.problems}`);
      renameSync(x.file, x.file.replace('.jpg', '.recheck.jpg'));
      if (x.png && existsSync(x.png)) rmSync(x.png);
      rmSync(join(out, 'spr', `_${x.key.slice(5)}`), { recursive: true, force: true });
    }
  }
  const spriteText = (s: Spec['sprites'][number], strict = '') => `${s.who.length ? `One character cut-out, full body, exactly as in the character sheet (same face, hair and clothes): ${board.people.filter((p) => s.who.includes(p.id)).map((p) => p.look).join('; ')}.` : 'One object cut-out.'} ${s.shows}\nDrawn in the same flat style as the sheet: flat colours, clean outlines, halftone shadows. Alone on a flat pure chroma green (#00B140) background, no shadow on the ground, no floor, nothing else in the picture. No sticker border or white outline around it, no glow or halo: its edge meets the green directly. Hands: every visible hand has exactly five clearly separated fingers (thumb included), even in a cartoon style; where the pose allows, keep hands in pockets, in gloves, around a held object or in a closed fist rather than spread open. Shoes and earrings match on both sides. ${strict}${NO_TEXT}`;
  // every character cut-out drawn now is checked like a painted frame (a torso set straight on the legs, an extra hand
  // came through unchecked); a pose that keeps failing is dropped and its shots take another pose of the same person
  // every check is kept (out/<song>/qa.json): the review page lists what a person must look at, and the error set
  // learns from what the person then says
  const qaFile = join(out, 'qa.json');
  const qa: Record<string, QaEntry> = existsSync(qaFile) ? JSON.parse(readFileSync(qaFile, 'utf8')) : {};
  const log = (e: QaEntry) => { qa[`${e.kind}:${e.id}`] = e; writeFileSync(qaFile, JSON.stringify(qa, null, 1)); };
  const badPose = new Set<string>();
  await Promise.all(spec.sprites.map(async (s) => {
    const file = join(out, 'spr', `${s.id}.jpg`);
    if (existsSync(file) || !s.who.length) return draw(file, spriteText(s), [cast], s.who.length ? '3:4' : '1:1');
    let wrong = '';
    for (let k = 0; k < 3; k++) {
      await draw(file, spriteText(s, wrong ? `The last attempt was wrong: ${wrong}. Do not repeat that. ` : ''), [cast], '3:4');
      const v = await verify(file, cast, board.people.filter((p) => s.who.includes(p.id)), '', 'standing on its own', s.shows);
      usd += v.usd;
      log({ kind: 'pose', id: s.id, file, status: v.status, problems: v.problems ? [v.problems] : [], tries: k + 1 });
      if (v.pass) return;
      wrong = v.problems;
      console.log(`pose ${s.id} try ${k + 1}: ${wrong}`);
      renameSync(file, file.replace('.jpg', `.reject${k}.jpg`));
    }
    badPose.add(s.id);
    log({ kind: 'pose', id: s.id, file, status: 'dropped', problems: [wrong], tries: 3 });
  }));
  // keyed: the largest figure of each picture, transparent PNG
  const keyed = async (s: Spec['sprites'][number]) => {
    const png = join(out, 'spr', `${s.id}.png`), tmp = join(out, 'spr', `_${s.id}`);
    if (!existsSync(png)) {
      execFileSync('uv', ['run', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', join(out, 'spr', `${s.id}.jpg`), tmp, '--min', '0.02'], { stdio: 'ignore' });
      const frames = JSON.parse(readFileSync(join(tmp, 'frames.json'), 'utf8')).frames as { file: string; w: number; h: number }[];
      const big = frames.sort((x, y) => y.w * y.h - x.w * x.h)[0];
      if (!big) return 0;
      copyFileSync(join(tmp, big.file), png);
    }
    const m = await sharp(png).metadata();
    return m.width! / m.height!;
  };
  const aspects: Record<string, number> = {};
  const dropped = new Set<string>();
  for (const s of spec.sprites.filter((x) => !badPose.has(x.id))) {
    let r = await keyed(s);
    if (oddCutout(r, s.who.length > 0)) {
      console.log(`cut-out ${s.id}: keyed ${r.toFixed(2)} wide, drawn again`);
      for (const ext of ['.jpg', '.png']) if (existsSync(join(out, 'spr', s.id + ext))) renameSync(join(out, 'spr', s.id + ext), join(out, 'spr', `${s.id}.reject${ext}`));
      rmSync(join(out, 'spr', `_${s.id}`), { recursive: true, force: true });
      await draw(join(out, 'spr', `${s.id}.jpg`), spriteText(s, 'One compact thing in the middle of the picture: nothing under or around it, no smear, band, reflection or blur. '), [cast], s.who.length ? '3:4' : '1:1');
      r = await keyed(s);
    }
    if (oddCutout(r, s.who.length > 0)) dropped.add(s.id);
    aspects[s.id] = r || 1;
  }
  for (const id of badPose) dropped.add(id);
  // a cut-out that would not key or would not pass leaves the shots it was in (a stray smear or a broken body reads
  // worse than nothing); a person keeps standing there in another pose of theirs
  const ownerOf = (id: string) => spec.sprites.find((x) => x.id === id)?.who[0];
  const another = (id: string) => spec.sprites.find((x) => x.who[0] && x.who[0] === ownerOf(id) && !dropped.has(x.id))?.id;
  for (const s of spec.shots) {
    s.props = s.props.filter((q) => !dropped.has(q.sprite));
    s.actors = s.actors.flatMap((q) => {
      const sprite = dropped.has(q.sprite) ? another(q.sprite) : q.sprite;
      return sprite ? [{ ...q, sprite, then: dropped.has(q.then) ? '' : q.then }] : [];
    });
  }
  if (dropped.size) console.log(`cut-outs dropped: ${[...dropped].join(', ')}`);

  // the lyric sits where the line's shot puts it (one shot can span frames drawn for the other side)
  // the side a line's lyric really sits on: the shot the treatment assigns that cue (as the renderer does), or for an
  // unsung frame the shot running at its start; a 0.02 s gap between a cue and the next shot once put the picture
  // under the words
  type TrShot = { id: string; start: number; end: number; params: { position?: string } };
  const sideOf = (f: { start: number; side: 'left' | 'right'; cue?: string }) => {
    const shotsTr = tr.shots as TrShot[];
    // a line repeated word for word stays up as the earlier one (the renderer keeps that line on screen and never shows
    // the repeat), so the earliest of a run of identical lines decides the side
    const norm = (t: string) => t.replace(/[.…。\s]+$/u, '').trim();
    // an unsung frame shows the last line still lingering on screen
    let cue = f.cue && !f.cue.startsWith('@') ? f.cue : (song.cues as { id: string; start: number }[]).filter((c) => c.start <= f.start + 0.001).at(-1)?.id;
    for (let k = song.cues.findIndex((c: { id: string }) => c.id === cue); cue && k > 0 && norm(song.cues[k - 1].text) === norm(song.cues[k].text); k--) cue = song.cues[k - 1].id;
    const id = cue ? (tr.cues as { cueId: string; shot: string }[]).find((c) => c.cueId === cue)?.shot : undefined;
    const shot = (id && shotsTr.find((x) => x.id === id)) || shotsTr.find((x) => x.start <= f.start && f.start < x.end);
    const p = shot?.params.position;
    return (p === 'left' || p === 'right' ? p : f.side) as 'left' | 'right';
  };
  // placement settled first (out of the lyric, readable size, head in frame), so the overlap check sees the final boxes
  for (const s of spec.shots) {
    const f = shots.find((x) => x.n === s.frame);
    if (!f) continue;
    const side = sideOf(f);
    s.layout = windowOff(s.mode === 'painted' ? paintedWindow(s.layout, spec.look.shapes) : s.layout, side);
    s.actors = arrange(s.actors.map((q) => ({ ...q, h: Math.max(q.h, MIN_FIGURE) })), aspects, side).map(headIn);
    // a prop drawn huge and alone read as a sign, not a thing in the scene (an object shot is painted whole instead)
    // falling and fluttering things pass behind people (a falling shirt once crossed the rapper's face), and a slow
    // song's crowd does not slide across the frame (it read as shadows drifting past)
    s.props = s.props.map((q) => ({ ...q, h: Math.min(q.h, 0.3), front: q.motion === 'fall' || q.motion === 'flutter' ? false : q.front, walk: calm ? 0 : q.walk }));
  }
  spec.shots = diversify(spec.shots, spec.sprites);
  // a whole frame is painted from the spec: its exact cast, touch and footing, nobody else; a frame the checker failed
  // is drawn again with what was wrong named, and a frame that keeps failing gives way to its substitute shot
  const paintFile = (s: Shot) => join(out, `paint_${s.frame}.jpg`);
  const paint = (s: Shot, wrong = '', substitute = false, simpler = false) => {
    const f = shots.find((x) => x.n === s.frame);
    const place = f?.place ? join(kf, `place_${f.place}.jpg`) : '';
    const who = substitute || s.subject !== 'people' ? [] : s.who.length ? s.who : f?.who ?? [];
    const people = board.people.filter((p) => who.includes(p.id)).map((p) => `${p.id}: ${p.look}`).join('; ');
    const scene = substitute ? s.fallback : simpler && s.simple ? s.simple : s.shows || f?.shows || '';
    const side = f ? sideOf(f) : 'left';
    const cast_ = who.length
      ? `Exactly ${who.length} ${who.length === 1 ? 'person' : 'people'} in the whole picture, as in the character sheet (first image): ${people}. Same faces, hair and clothes. Nobody else anywhere: no crowd, no passers-by, no figures in the background, no reflections or posters of people. Every hand belongs to a visible arm of its own person and has exactly five clearly separated fingers (thumb included), even in a cartoon style; prefer hands in pockets, gloves, fists or around held objects to spread open hands. Shoes and earrings match on both sides. Natural anatomy. Show the touch through bodies, heads and shoulders, with as few visible hands as the moment allows (hands behind the other person, in pockets or out of frame).${s.contact ? ` Contact: ${s.contact}.` : ''}${s.support ? ` Footing: ${s.support}.` : ''}`
      : 'Nobody in this picture: no people, faces, hands or bodies, not even far away.';
    return draw(paintFile(s), `One frame of an animated music video. ${LOOK} ${cast_} ${existsSync(place) ? 'The place as in the setting sheet (second image).' : ''}\nScene: ${scene}\nThe main subject in the ${side === 'left' ? 'right' : 'left'} two thirds; the ${side} third is quiet scenery (the lyrics go there). One continuous full-bleed 16:9 image, a single scene.${wrong ? ` The last attempt was wrong: ${wrong}. Do not repeat that.` : ''} ${NO_TEXT}`, [cast, ...(existsSync(place) ? [place] : [])], '16:9');
  };
  const painted = spec.shots.filter((s) => s.mode === 'painted');
  await Promise.all(painted.map(async (s) => {
    // a frame kept from an earlier run was checked when it was drawn
    if (existsSync(paintFile(s))) return;
    const f = shots.find((x) => x.n === s.frame);
    const who = s.subject === 'people' ? (s.who.length ? s.who : f?.who ?? []) : [];
    let wrong = '';
    // a key story moment gets two more tries in its simpler composition before anything replaces it
    const tries = s.key && s.simple ? 5 : 3;
    for (let k = 0; k < tries; k++) {
      await paint(s, wrong, false, k >= 3);
      const v = await verify(paintFile(s), cast, who.map((id) => board.people.find((p) => p.id === id)!).filter(Boolean), s.contact, s.support, s.shows || f?.shows || '');
      usd += v.usd;
      log({ kind: 'paint', id: String(s.frame), file: paintFile(s), status: v.status, problems: v.problems ? [v.problems] : [], tries: k + 1 });
      if (v.pass) return;
      wrong = v.problems;
      console.log(`paint ${s.frame} try ${k + 1}: ${wrong}`);
      renameSync(paintFile(s), paintFile(s).replace('.jpg', `.reject${k}.jpg`));
    }
    // a key story moment is never swapped for an empty shot: its best attempt stays, held for a person to judge
    if (s.key) {
      const last = paintFile(s).replace('.jpg', `.reject${tries - 1}.jpg`);
      if (existsSync(last)) renameSync(last, paintFile(s));
      console.log(`paint ${s.frame}: key shot kept for a person to check (${wrong})`);
      log({ kind: 'paint', id: String(s.frame), file: paintFile(s), status: 'uncertain', problems: [`KEY SHOT — check by eye: ${wrong}`], tries });
      return;
    }
    // three failures: the substitute shot (an object or the place, nobody to get wrong)
    for (let k = 0; k < 2; k++) {
      await paint(s, '', true);
      const seen = await look(paintFile(s));
      if (!seen.panels && seen.people === 0) { console.log(`paint ${s.frame}: substitute shot used`); log({ kind: 'paint', id: String(s.frame), file: paintFile(s), status: 'substitute', problems: [wrong], tries: 3 }); return; }
      renameSync(paintFile(s), paintFile(s).replace('.jpg', `.subreject${k}.jpg`));
    }
    // nothing clean came out: the shot shows its empty set rather than a picture that is wrong or missing
    console.log(`paint ${s.frame}: no clean picture, its set is shown instead`);
    log({ kind: 'paint', id: String(s.frame), file: paintFile(s), status: 'dropped', problems: [wrong], tries: 5 });
    Object.assign(s, { mode: 'cutout', actors: [], props: [] });
  }));
  // the keyframes treatment with the passage's frames restaged
  const assets = JSON.parse(readFileSync(join(kf, 'assets.json'), 'utf8'));
  for (const s of spec.sets) assets[`set_${s.id}`] = { kind: 'image', url: resolve(out, `set_${s.id}.jpg`) };
  for (const s of spec.sprites) assets[`spr:${s.id}`] = { kind: 'image', url: resolve(out, 'spr', `${s.id}.png`) };
  for (const sec of secs) {
    const f = shots.find((x) => sec.layers.some((l) => l.kind === 'photo' && l.asset === `kf_${x.n}`));
    const s = f && spec.shots.find((x) => x.frame === f.n);
    if (!f || !s) continue;
    // memory and present meet in a water-like warp; a painted frame in the same place simply cuts (a blur dissolve
    // read as the picture going out of focus)
    const kinds: Record<string, unknown> = { warp: { kind: 'warp', dur: 0.7 }, ripple: { kind: 'warp', dur: 0.7 }, liquid: { kind: 'warp', dur: 0.7 } };
    if (kinds[s.transition]) sec.transition = kinds[s.transition];
    else delete sec.transition;
    if (s.mode === 'painted') {
      // a painted frame sits on the page like any other picture: whole, or inside its shape on paper
      assets[`paint_${s.frame}`] = { kind: 'image', url: resolve(out, `paint_${s.frame}.jpg`) };
      const page = { ...s, look: spec.look, set: `paint_${s.frame}`, actors: [], props: [] };
      sec.layers = sec.layers.map((l) => (l.kind === 'photo' ? (s.layout?.shape && s.layout.shape !== 'full' ? { kind: 'code', src: shotCode(page, f.end - f.start, aspects) } : { ...l, asset: `paint_${s.frame}` }) : l));
      continue;
    }
    const fixed = { ...s, look: spec.look, set: `set_${s.set}`, actors: s.actors.map((q) => (q.then ? { ...q, at: onBeat(q.at, f.start, f.end - f.start, song.downbeats ?? []) } : q)) };
    sec.layers = sec.layers.map((l) => (l.kind === 'photo' ? { kind: 'code', src: shotCode(fixed, f.end - f.start, aspects) } : l));
  }
  // keyframes never drawn (--sheets-only) are not assets: a missing file stalls the renderer's preload
  for (const id of Object.keys(assets)) if (id.startsWith('kf_') && !existsSync(assets[id].url)) delete assets[id];
  for (const sec of secs) sec.layers = sec.layers.filter((l) => !(l.kind === 'photo' && l.asset && !assets[l.asset]));
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(tr));
  writeFileSync(join(out, 'assets.json'), JSON.stringify(assets));
  console.log(`cutout: ${readdirSync(join(out, 'spr')).filter((x) => x.endsWith('.png')).length} cut-outs, $${usd.toFixed(2)} → ${join(out, 'treatment.json')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
