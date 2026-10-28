// A passage told as story frames (Codex/Claude 2026-10-23): the writer storyboards the passage shot by shot, one
// meaning a frame, with the people in it (fixed looks, their expression and what they do), the props carrying the
// story, and what changed since the frame before; the image model draws a character sheet once, then every frame with
// the sheet, the song's own style reference and the previous frame as references, so faces, clothes and style hold.
// Each frame leaves one side empty for the vertical lyric. The frames are laid into the typeplan's treatment for the
// passage as full pictures (a slow drift), the new director's lyrics over them.
//
// npx tsx scripts/lyric-vj/keyframes.mts --song <song.json> --treatment <old director's treatment> --plan <typeplan dir>
//   --style-ref <image> --from 36 --to 71 --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { persistQuiet, sectionArcRule, unsungFrameRule } from './interludes.mts';
import { lessonsText } from './lessons.mts';
import { unsungWindows } from '../../src/app/lyric-vj/structure';
import type { Interlude } from '../../src/app/lyric-vj/treatment';
import sharp from 'sharp';

type Cue = { id: string; start: number; end: number; text: string };
export type Board = {
  logline: string;
  style: string;
  /** The style the user typed, when they gave one (the writer's `style` is its rewrite, names turned into traits). */
  userStyle?: string;
  people: { id: string; look: string }[];
  /** The story's places, each drawn once as a setting sheet every frame there refers to. */
  places?: { id: string; look: string }[];
  /** reuse: a frame (1-based) shown again as it was (a memory echoed), 0 none. */
  frames: { cue: string; shows: string; who: string[]; feeling: string; change: string; side: 'left' | 'right'; place?: string; reuse?: number }[];
};

/** The stretches a frame would hold past `max` seconds: where frames must be added (an interlude, an outro). */
export function longHolds(times: { start: number; end: number }[], max = 12): [number, number][] {
  return times.filter((x) => x.end - x.start > max).map((x) => [x.start, x.end]);
}

/** How many frames a passage takes: one per 7.5 s, 5 to 32. */
export const frameCount = (seconds: number) => Math.max(5, Math.min(32, Math.round(seconds / 7.5)));

/** A frame's description without the writer's own notes on blank areas (it drew a white haze where it asked for one). */
export const withoutBlankNotes = (shows: string) => shows.split(/(?<=\.)\s+/).filter((x) => !/third|empty|blank|negative space|lyrics/i.test(x)).join(' ');

/**
 * A frame as a full 16:9 picture: the image model, following a style sheet of things on paper, drew its scenes as a
 * panel with paper margins; the margin (the corner's colour) is trimmed and the picture fills the frame (cropped to cover).
 */
export async function fullBleed(src: string, dest: string) {
  const meta = await sharp(src).metadata();
  const [w, h] = [192, Math.round((192 * (meta.height ?? 1080)) / (meta.width ?? 1920))];
  const { data } = await sharp(src).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = drawnBox(data, w, h);
  const sx = (meta.width ?? 1920) / w, sy = (meta.height ?? 1080) / h;
  const crop = { left: Math.floor(box[0] * sx), top: Math.floor(box[1] * sy), width: Math.ceil((box[2] - box[0]) * sx), height: Math.ceil((box[3] - box[1]) * sy) };
  // a panel taller than the frame loses its bottom, not its heads (the attention crop cut off a face)
  await sharp(src).extract(crop).resize(1920, 1080, { fit: 'cover', position: crop.width / crop.height < 16 / 9 ? 'top' : 'centre' }).jpeg({ quality: 90 }).toFile(dest);
}

/**
 * The drawn part of an RGB image: the columns and rows where more than 6 % of pixels are not paper (darker than 232 or
 * clearly coloured); paper is the pale, nearly grey margin a panel sits on. The whole image when nothing passes.
 */
export function drawnBox(rgb: Uint8Array | Buffer, w: number, h: number): [number, number, number, number] {
  const ink = (i: number) => {
    const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]];
    return Math.min(r, g, b) < 232 || Math.max(r, g, b) - Math.min(r, g, b) > 28;
  };
  const cols = Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => ink((y * w + x) * 3)).filter(Boolean).length / h);
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => ink((y * w + x) * 3)).filter(Boolean).length / w);
  const span = (v: number[]) => {
    const a = v.findIndex((x) => x > 0.06), z = v.length - 1 - [...v].reverse().findIndex((x) => x > 0.06);
    return a < 0 ? [0, v.length] : [a, z + 1];
  };
  const [x0, x1] = span(cols), [y0, y1] = span(rows);
  return [x0, y0, x1, y1];
}

/**
 * Whether a drawn frame came out as a collage or a panel on paper: the share of its columns that are paper, and the
 * longest run of them (a gap between two panels, or a margin). A frame over 14 % paper columns, or with a run over 8 %,
 * is drawn again.
 */
export function paperColumns(rgb: Uint8Array | Buffer, w: number, h: number) {
  const ink = (i: number) => Math.min(rgb[i], rgb[i + 1], rgb[i + 2]) < 232 || Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) - Math.min(rgb[i], rgb[i + 1], rgb[i + 2]) > 28;
  const paper = Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => ink((y * w + x) * 3)).filter(Boolean).length / h < 0.06);
  let run = 0, longest = 0;
  for (const p of paper) longest = Math.max(longest, (run = p ? run + 1 : 0));
  return { share: paper.filter(Boolean).length / w, run: longest / w };
}
export const isCollage = (c: { share: number; run: number }) => c.share > 0.14 || c.run > 0.08;

/** What a looker saw in a drawn frame, and whether that breaks the board: panels side by side, or people where none belong. */
export type Look = { panels: boolean; people: number };
export const badLook = (l: Look, who: string[]) => l.panels || (!who.length && l.people > 0);

const LOOK_SCHEMA = { type: 'object', additionalProperties: false, required: ['panels', 'people'], properties: { panels: { type: 'boolean' }, people: { type: 'integer' } } };
/** Pixel rules cannot tell a panel seam from a lamp post, so a small vision model looks at each drawn frame. */
export async function look(file: string): Promise<Look> {
  const image = (await sharp(file).resize(768).jpeg({ quality: 80 }).toBuffer()).toString('base64');
  const msg = await new Anthropic({ maxRetries: 8 }).messages.create({ model: 'claude-haiku-5-5', max_tokens: 1000, messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
    { type: 'text', text: 'About this illustration. panels: true if it is not one continuous scene but two or more separate pictures side by side, panels, insets or a picture-in-picture. people: how many human figures are visible, counting partial ones (a face, a hand, a shoulder, a ghostly figure).' },
  ] }], output_config: { format: { type: 'json_schema', schema: LOOK_SCHEMA } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  const text = msg.content.find((c) => c.type === 'text');
  // ponytail: an unreadable answer passes the frame; the contact sheet is the backstop
  try { return JSON.parse(text && text.type === 'text' ? text.text : ''); } catch { return { panels: false, people: 0 }; }
}

/**
 * How much of a frame's lyric side is bare paper (pale and colourless): asked to keep that side quiet, the image model
 * left it unpainted or in thin sketch lines, the frame reading as a panel beside a blank page.
 */
export function sidePaper(rgb: Uint8Array | Buffer, w: number, h: number, side: 'left' | 'right') {
  const [x0, x1] = side === 'left' ? [0, Math.floor(w / 3)] : [w - Math.floor(w / 3), w];
  let paper = 0;
  for (let y = 0; y < h; y++)
    for (let x = x0; x < x1; x++) {
      const k = (y * w + x) * 3, lo = Math.min(rgb[k], rgb[k + 1], rgb[k + 2]), hi = Math.max(rgb[k], rgb[k + 1], rgb[k + 2]);
      if (lo >= 232 && hi - lo <= 28) paper++;
    }
  return paper / ((x1 - x0) * h);
}

/** The frames in song seconds, each held until the next (the last until the passage ends); frames off the passage dropped. */
export function frameTimes(b: Board, cues: Cue[], from: number, to: number) {
  // a frame keyed '@seconds' lands on a moment nobody sings (an interlude, the outro)
  const at = b.frames.map((f) => ({ f, t: f.cue.startsWith('@') ? Number(f.cue.slice(1)) : cues.find((c) => c.id === f.cue)?.start })).filter((x): x is { f: Board['frames'][number]; t: number } => x.t !== undefined && x.t >= from - 0.5 && x.t < to).sort((x, y) => x.t - y.t);
  return at.map((x, i) => ({ ...x.f, start: i ? x.t : from, end: at[i + 1]?.t ?? to }));
}

if (process.argv[1]?.endsWith('keyframes.mts')) {
  // --cast / --people: an approved cast sheet and the board whose people (and style) it was drawn from, kept as they are
  const { values: a } = parseArgs({ options: { cast: { type: 'string' }, people: { type: 'string' }, song: { type: 'string' }, treatment: { type: 'string' }, plan: { type: 'string' }, 'style-ref': { type: 'string' }, style: { type: 'string' }, 'sheets-only': { type: 'boolean' }, from: { type: 'string' }, to: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' }, 'image-model': { type: 'string', default: 'gemini-3.1-flash-image' } } });
  const envFile = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const out = a.out!;
  mkdirSync(out, { recursive: true });
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { title: string; cues: Cue[] };
  const base = JSON.parse(readFileSync(a.treatment!, 'utf8')) as { concept?: string; design?: { language?: string }; interludes?: Interlude[] };
  const [from, to] = [Number(a.from), Number(a.to)];
  const lines = song.cues.filter((c) => c.start >= from - 0.5 && c.start < to);
  const keepPeople = a.people ? (JSON.parse(readFileSync(a.people, 'utf8')) as Board) : undefined;
  const parts = ((song as { sections?: { start: number; end: number; type: string }[] }).sections ?? []).filter((x) => x.end > from && x.start < to);
  const n = frameCount(to - from);
  const boardFile = join(out, 'board.json');
  let usd = 0;
  let board = {} as Board;
  if (existsSync(boardFile)) board = JSON.parse(readFileSync(boardFile, 'utf8'));
  else {
    const windows = unsungWindows({ cues: song.cues, duration: (song as { duration?: number }).duration ?? to }).filter((w) => w.end > from && w.start < to);
    const prompt = `你是〈${song.title}〉這支 MV 的編劇兼分鏡師。這次只做 ${from}–${to} 秒這一段，要讓沒看過劇本的人看得懂發生了什麼事。
整支的概念：${base.concept ?? ''}
這段的歌詞（id、秒數、內容）：
${lines.map((c) => `${c.id} ${c.start.toFixed(1)} ${c.text}`).join('\n')}

${lessonsText() ? `過去作品的使用者回饋整理出的經驗（一定要遵守）：\n${lessonsText()}\n` : ''}規則：
- 歌詞若有粗話、性暗示或成人內容，畫面一律保持輕鬆、不露骨、全年齡：用表情、反應、道具或旁人的吐槽帶過，不畫出來；照樣把整段每一格都寫完。
- 先想清楚這段的故事：誰、在哪、想要什麼、發生什麼轉折、結果是什麼。要有人物（表情與動作），可以有道具撐起劇情。
- 分成約 ${n} 格畫面（frames），每格對應一句歌詞開始的時間（cue），一格只說一件事；重要事件要有「之前／之後」兩格。先建立關係，再讓它改變；結果要留在畫面上。
- ${unsungFrameRule(windows, base.interludes)}
- 段落：${parts.map((x) => `${x.type} ${x.start.toFixed(0)}–${x.end.toFixed(0)}s`).join('、') || '（無）'}。${sectionArcRule(windows, base.interludes)}重複的副歌沿用同一個構圖或意象，但要讓表情、距離或道具狀態不同（看得出又往前一步）；只有回憶的呼應才可以原樣重用前面某一格（reuse 填那一格的序號，否則 0）。
- places：故事發生的 2–4 個地方（英文寫給生圖模型：地點、建築、季節、時間與光線，不要人物），每格的 place 填其中一個 id。
- 構圖：人物和重要的東西集中在 side 的另一側，side 那一側約三分之一寬要是場景的一部分但很安靜（天空、牆、雪地、水面），給直排歌詞放。
- shows 用英文寫給生圖模型：構圖（遠中近景）、誰在哪裡、表情、動作、道具、場景、時間與光線；畫面 ${'一側'}（side 指定的那一側，約三分之一寬）要留成乾淨的天空、牆或雪地，給直排歌詞放。不要寫任何字或招牌文字。
- who：這格出現的人物 id；feeling：這格的情緒；change：跟上一格相比，觀眾看得到什麼變化（繁體中文一句）。
${keepPeople ? `- people：人物已經定好，照抄這些 id 和外觀，不要改：\n${keepPeople.people.map((p) => `  ${p.id}: ${p.look}`).join('\n')}` : '- people：每個人物的固定外觀（英文：年齡感、髮型、髮色、衣服款式與顏色、配件），要具體到每格都能畫得一樣。'}
- style：${a.style ? `使用者指定的畫風是「${a.style}」，照它寫成英文的畫風描述（線條、上色、色彩、質感、光線）。如果裡面指名了真實的畫家、漫畫家、動畫工作室或作品，改寫成具體的視覺特徵（例如手繪水彩背景、柔和逆光、細線人物），不要出現任何名字。` : `英文，只描述畫風本身（線條、上色、色彩、質感、光線），要跟這首歌的設計語言 ${base.design?.language ?? ''} 一致，參考圖會給生圖模型。`}不要描述畫面外的載體或包裝：不要寫成照片、證物、文件夾、卡片、拼貼板、相框、印章、迴紋針、膠帶這類（那些由後面的版面另外處理），每格都是鋪滿畫面的一個場景。
- logline：這段的故事一句話（繁體中文）。`;
    const str = { type: 'string' };
    const pair = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'look'], properties: { id: str, look: str } } };
    const SCHEMA = { type: 'object', additionalProperties: false, required: ['logline', 'style', 'people', 'places', 'frames'], properties: {
      logline: str, style: str, people: pair, places: pair,
      frames: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cue', 'shows', 'who', 'feeling', 'change', 'side', 'place', 'reuse'], properties: { cue: str, shows: str, who: { type: 'array', items: str }, feeling: str, change: str, side: { type: 'string', enum: ['left', 'right'] }, place: str, reuse: { type: 'integer' } } } },
    } };
    // a whole song once came back as a single frame: a board far short of its frame count is written again
    for (let k = 0; k < 2; k++) {
      const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 48000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
      usd += (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
      board = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}');
      writeFileSync(join(out, 'board.prompt.txt'), prompt);
      if ((board.frames?.length ?? 0) >= Math.ceil(n * 0.6)) break;
      console.log(`board: ${board.frames?.length ?? 0} frames for about ${n} (${msg.stop_reason}), written again`);
    }
    // a style the user asked for wins over the one the approved cast was drawn in
    if (keepPeople) Object.assign(board, { people: keepPeople.people, ...(a.style ? {} : { style: keepPeople.style }) });
    if (a.style) board.userStyle = a.style;
    for (const f of board.frames) f.shows = withoutBlankNotes(f.shows) || f.change;
    writeFileSync(boardFile, JSON.stringify(board, null, 1));
  }
  {
    const q = persistQuiet(boardFile, board, song, base.interludes, to);
    board = q.board;
    console.log(`interludes: cleared people from ${q.cleared} frames`);
    for (const f of q.clearedFrames) if (f.shows.trim()) console.error(`warning: frame ${f.cue} is in a backdrop window but its shows text may still describe a person: ${f.shows.slice(0, 80)}`);
  }
  console.log(`story: ${board.logline}`);
  board.frames.forEach((f, i) => console.log(`  ${i + 1}. ${f.cue} [${f.who.join(',')}] ${f.feeling}｜${f.change}`));

  const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
  const img = (f: string) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') });
  const draw = async (file: string, text: string, refs: string[], ratio = '16:9') => {
    if (existsSync(file)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let r: any;
    for (let k = 0; k < 3 && !r?.output_image?.data; k++)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model: a['image-model'], input: [{ type: 'text', text }, ...refs.map(img)], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ratio, image_size: '2K' } });
    if (!r?.output_image?.data) throw new Error(`no image for ${file}: ${JSON.stringify(r).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
    usd += 0.101;
  };
  // a style reference that is itself a document (an evidence folder, a pinned photo) was copied as the frame around
  // every picture: the place is drawn alone, edge to edge
  const NO_TEXT = 'Absolutely no text, letters, numbers, signs or watermarks anywhere. The picture itself only: not a photo, card or document lying on paper; no stamps, paper clips, tape, labels or borders.';
  const sheet = join(out, 'cast.jpg');
  if (a.cast && !existsSync(sheet)) writeFileSync(sheet, readFileSync(a.cast));
  for (const p of board.places ?? []) await draw(join(out, `place_${p.id}.jpg`), `Setting sheet for an illustrated music video: one wide establishing view, no people. Style: ${board.style}; ${a['style-ref'] ? 'keep the drawing technique and inks of the reference image (not its layout or paper)' : 'follow the style description exactly'}.\nPlace: ${p.look}\nA single continuous full-bleed image. ${NO_TEXT}`, (a['style-ref'] ? [a['style-ref']] : []));
  await draw(sheet, `Character reference sheet for an illustrated music video. Style: ${board.style}. ${a['style-ref'] ? 'Match the drawing technique and inks of the first reference image (not its layout or paper).' : ''} Draw each character full body, front view and three-quarter view, on a plain paper background, side by side, clearly separated:\n${board.people.map((p) => `- ${p.id}: ${p.look}`).join('\n')}\n${NO_TEXT}`, a['style-ref'] ? [a['style-ref']] : []);
  const timed = frameTimes(board, song.cues, from, to);
  let prev = '', prevPlace = '';
  // --sheets-only (cut-out mode): only the cast and place sheets; cutout.mts paints the few whole frames it needs
  for (const [i, f] of a['sheets-only'] ? [] : timed.entries()) {
    const file = join(out, `frame_${i + 1}.jpg`);
    // a memory echoed: the earlier frame shown again as it was
    if (f.reuse && f.reuse >= 1 && f.reuse <= i && existsSync(join(out, `frame_${f.reuse}.jpg`))) {
      if (!existsSync(file)) writeFileSync(file, readFileSync(join(out, `frame_${f.reuse}.jpg`)));
      await fullBleed(file, join(out, `frame_${i + 1}.full.jpg`));
      console.log(`frame ${i + 1} reuses ${f.reuse}`);
      continue;
    }
    const placeSheet = f.place ? join(out, `place_${f.place}.jpg`) : '';
    const placeRef = placeSheet && existsSync(placeSheet) ? [placeSheet] : [];
    // the frame before only while the story stays in the same place (a new place starts from its setting sheet)
    const prevRef = prev && f.place === prevPlace ? [prev] : [];
    const people = board.people.filter((p) => f.who.includes(p.id)).map((p) => `${p.id}: ${p.look}`).join('; ');
    await draw(file, `One frame of an illustrated music video. Style: ${board.style}; the same drawing technique and inks as the character sheet (first image). ${people ? `The characters must look exactly like the character sheet: ${people}. Same faces, hair and clothes.` : 'Nobody is in this frame: no people, faces, hands or bodies.'} ${placeRef.length ? 'The place is the one in the setting sheet (second image): same architecture and surroundings.' : ''} ${prevRef.length ? 'Continue from the previous frame (last image): same place, light and art direction.' : ''} A single continuous image: no collage, no panels, no insets, no split screen.\nScene: ${f.shows}\nPainted edge to edge over the whole 16:9 canvas in full colour: no white or paper margins, no unpainted, faded or sketch-only areas. Place the people and the key objects in the ${f.side === 'left' ? 'right' : 'left'} two thirds; the ${f.side} third shows more of the same scene (its sky, street, river or snowfield), painted as fully and richly as the rest, with no person in it. ${NO_TEXT}`, [sheet, ...placeRef, ...prevRef]);
    // a collage or a panel on paper is drawn again without the style sheet (a sheet of things on paper, it taught the
    // model to lay panels out) and told to fill the frame
    for (let k = 0; k < 2; k++) {
      const { data, info } = await sharp(file).resize(192, 108, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const c = paperColumns(data, info.width, info.height), bare = sidePaper(data, info.width, info.height, f.side);
      const seen = await look(file);
      if (!isCollage(c) && !badLook(seen, f.who) && (bare <= 0.45 || i === timed.length - 1)) break;
      console.log(`frame ${i + 1}: collage, panels, stray people or a bare lyric side (paper ${(c.share * 100).toFixed(0)}%, run ${(c.run * 100).toFixed(0)}%, side ${(bare * 100).toFixed(0)}%, ${JSON.stringify(seen)}), redrawn`);
      writeFileSync(file.replace(/\.jpg$/, `.reject${k}.jpg`), readFileSync(file));
      const again = file.replace(/\.jpg$/, '.again.jpg');
      await draw(again, `One frame of an illustrated music video, painted edge to edge over the whole 16:9 canvas in full colour: one single scene, no collage, no panels, no white, paper, faded or sketch-only areas anywhere. Style: ${board.style}, the same drawing technique as the character sheet (first image). ${people ? `The characters must look exactly like the character sheet: ${people}.` : 'Nobody is in this frame: no people, faces, hands or bodies.'} ${placeRef.length ? 'The place is the one in the setting sheet (second image).' : ''}\nScene: ${f.shows}\nPeople and key objects in the ${f.side === 'left' ? 'right' : 'left'} two thirds; the ${f.side} third is more of the same scene, painted as fully as the rest. Absolutely no text, letters, numbers, signs or watermarks anywhere.`, [sheet, ...placeRef]);
      writeFileSync(file, readFileSync(again));
      rmSync(again);
    }
    prev = file;
    prevPlace = f.place ?? '';
    await fullBleed(file, join(out, `frame_${i + 1}.full.jpg`));
    console.log(`frame ${i + 1} ${f.start.toFixed(1)}–${f.end.toFixed(1)} s drawn`);
  }

  // the frames into the plan's treatment: full pictures over the passage, the lyric set vertical on the empty side
  const tr = JSON.parse(readFileSync(join(a.plan!, 'treatment.json'), 'utf8'));
  const assets: Record<string, { kind: string; url: string }> = JSON.parse(readFileSync(join(a.plan!, 'assets.json'), 'utf8'));
  timed.forEach((_, i) => (assets[`kf_${i + 1}`] = { kind: 'image', url: join(process.cwd(), out, `frame_${i + 1}.full.jpg`) }));
  const outside = tr.graphics.sections.filter((s: { start: number }, k: number, all: { start: number }[]) => (all[k + 1]?.start ?? 1e9) <= from || s.start >= to);
  const before = outside.filter((s: { start: number }) => s.start < from), after = outside.filter((s: { start: number }) => s.start >= to);
  const resume = tr.graphics.sections.filter((s: { start: number }) => s.start <= to).at(-1);
  // each frame keeps a quiet kinetic layer of the plan's over its picture: a section without one fell back to the old
  // director's look (its plates hidden, a spot iris over a black frame)
  const kineticAt = (t: number) => (tr.graphics.sections.filter((x: { start: number }) => x.start <= t + 0.01).at(-1)?.layers ?? []).find((l: { kind: string }) => l.kind === 'kinetic');
  const quiet = (t: number) => {
    const k = { ...(kineticAt(t) ?? {}) };
    for (const key of ['sprite', 'board', 'stage', 'meta', 'cam', 'flash', 'label']) delete k[key];
    return { ...k, kind: 'kinetic', fx: 'motes', words: [], bare: true, hush: true, at: +t.toFixed(3) };
  };
  const frames = timed.map((f, i) => ({ start: +f.start.toFixed(3), layers: [{ kind: 'photo', mode: 'full', asset: `kf_${i + 1}`, drift: 0.4, own: true }, quiet(f.start)], transition: { kind: i ? 'cut' : 'dissolve' } }));
  tr.graphics.sections = [...before, ...frames, ...(after[0]?.start > to + 0.05 || !after.length ? [{ ...resume, start: to }] : []), ...after];
  for (const sh of tr.shots as { start: number; end: number; template: string; params: Record<string, unknown> }[]) {
    if (sh.end <= from || sh.start >= to) continue;
    const f = timed.find((x) => sh.start >= x.start - 0.05 && sh.start < x.end) ?? timed[0];
    sh.template = 'vertical';
    sh.params = { position: f.side, dim: 0, step: 0.6, lift: 60 };
    // the old director's camera and wipes are off: the frames carry the picture
    Object.assign(sh, { camera: 'static', transitionIn: 'cut' });
  }
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(tr));
  writeFileSync(join(out, 'assets.json'), JSON.stringify(assets));
  console.log(`keyframes: ${timed.length} frames, $${usd.toFixed(2)} → ${join(out, 'treatment.json')}`);
}
