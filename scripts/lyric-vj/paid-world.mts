// The paid tiers on a style world (plan step 7, 2026-11-03): a paid song is drawn in one of the worlds the free tier
// draws from, the line director choosing each line inside it. The buyer's style names the world when a world has that
// language; else the director picks one, with a reason, avoiding the worlds the last songs took. The plan carries its
// world (PlanWorld), so typeplan --plan / --bind build its treatment the way the free tier does (composerTreatment), and
// the old paid design is kept only for what the world does not cover: the concept and the parts' meaning.
import { FREE_STYLES, STYLE_PALETTES, styleFont } from '../../src/app/lyric-vj/free-styles';
import { composerTreatment } from '../../src/app/lyric-vj/free-plan';
import { poolOf, schemeFor, type StyleWorld } from '../../src/app/lyric-vj/style-world';
import { STYLE_WORLDS, worldById } from '../../src/app/lyric-vj/style-worlds';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';
import { composerBase, fitsCalm, RECIPES, SHARED_SHARE, type WorldPool } from './lineplan-core.mts';

export interface WorldPalette { ink: string; paper: string; accent: string; heart: string }
/** What a plan keeps of its world: enough to build its treatment again with no director call. */
export interface PlanWorld { id: string; scheme: number; palette: WorldPalette; font: string; why: string; by: 'buyer' | 'director' | 'only' }
export interface WorldRecord { song: string; world?: string }

/** The worlds a buyer's style allows: its own world(s) by id or language; none named, or none for that style, every world. */
export function worldCandidates(style?: string): StyleWorld[] {
  if (!style || style === 'auto') return STYLE_WORLDS;
  const own = STYLE_WORLDS.filter((w) => w.id === style || w.language === style);
  return own.length ? own : STYLE_WORLDS;
}

/** Worlds the last `recent` other songs took twice or more: the director is told to look elsewhere. */
export function overusedWorlds(history: WorldRecord[], song: string, recent = 6): string[] {
  const used = history.filter((r) => r.song !== song && r.world).slice(-recent).map((r) => r.world!);
  const count = new Map<string, number>();
  for (const w of used) count.set(w, (count.get(w) ?? 0) + 1);
  return [...count].filter(([, n]) => n >= 2).map(([w]) => w);
}

/** The song's world written into the design history (its record, or a new one). */
export function recordWorld<T extends WorldRecord>(history: T[], song: string, world: string): T[] {
  const own = history.find((r) => r.song === song);
  if (own) return history.map((r) => (r === own ? { ...r, world } : r));
  return [...history, { song, world } as T];
}

/** The plan's record of a world: the scheme the song opens on (the free tier's rule), its colours and face. */
export function planWorldOf(w: StyleWorld, song: { title: string; cues: { text: string }[] }, calm: boolean, why: string, by: PlanWorld['by'], seed = 0): PlanWorld {
  const scheme = schemeFor(w, song.title, calm ? 'frost' : 'tea', seed);
  const style = FREE_STYLES.find((s) => s.id === w.id)!;
  return { id: w.id, scheme, palette: STYLE_PALETTES[w.palette[scheme].id], font: styleFont(style, song.cues.map((c) => c.text).join(''), calm), why, by };
}

export const worldPoolOf = (pw: PlanWorld): WorldPool => poolOf(worldById(pw.id)!, RECIPES, pw.scheme);

/** One line per world for the director's pick. */
export const worldListPrompt = (worlds: StyleWorld[]) => worlds.map((w) => `- ${w.id}｜${w.name}｜${w.family}｜${w.what}｜歌詞是：${w.lyricRole}`).join('\n');

/** The director's call for the world alone, before any line is directed. */
export function worldPickPrompt(song: { title: string; cues: { text: string }[] }, worlds: StyleWorld[], avoid: string[], concept: string, calm: boolean) {
  return `你是這首歌的歌詞 MV 導演。先替整首歌選一個「風格世界」：字會活在這個世界裡，版面、進退場、背景、轉場、配色、字體都是它的。選的理由要來自歌詞和概念，不是因為世界好看。${calm ? '這是安靜的歌，字少、停得久：選留白多、動得慢的世界。' : ''}
${avoid.length ? `最近的歌用過太多次、這首避免：${avoid.join('、')}。` : ''}
概念：${concept || '（無）'}
歌名：${song.title}
歌詞：
${song.cues.map((c) => c.text).join('\n')}

可選的世界（id｜名稱｜家族｜它是什麼｜歌詞在裡面是什麼）：
${worldListPrompt(worlds)}

輸出 world（id）和 why（一句、三十字內，引用歌詞裡的字當根據）。`;
}
export const WORLD_PICK_SCHEMA = { type: 'object', additionalProperties: false, required: ['world', 'why'], properties: { world: { type: 'string' }, why: { type: 'string' } } };

/** The world's own line sets, as the director may name them. */
export const worldSets = (pool: WorldPool) => [...new Set(pool.recipes.flatMap((r) => (r.wline ? [r.wline.set] : [])))];

/**
 * The kit the director chooses from in a world: its own sets with their moves, the shared stacks it lets in, its grounds,
 * what it has no use for. In place of the open kit's layouts, grounds and paper devices.
 */
export function worldKitPrompt(w: StyleWorld, pool: WorldPool, calm: boolean, n: number) {
  const sets = w.layouts.lines.filter((l) => !(calm && l.loud)).map((l) => `- ${l.set}｜層級 ${l.levels.join('/')}｜enter：${l.enters.join('、')}｜exit：${l.exits.join('、')}｜idle：${l.hold}｜${l.min ?? 0}–${l.max ?? '∞'} 字${l.column ? '｜直排，只給漢字假名' : ''}${l.ground ? '｜自帶地面，ground 留空' : ''}`);
  const shared = pool.recipes.filter((r) => !r.wline && (!calm || fitsCalm(r))).map((r) => `- ${r.template} + ${r.enter} + ${r.idle}${r.min || r.max ? `（${r.min ?? 0}–${r.max ?? '∞'} 字）` : ''}${r.template === 'build-cut' ? '（可 split）' : ''}`);
  const grounds = calm ? `慢歌只用安靜的：${pool.quiet.join('、')}` : `層級 0：${pool.grounds[0].join('、')}；層級 1：${pool.grounds[1].join('、')}；層級 2：${pool.grounds[2].join('、')}`;
  return `【風格世界】${w.name}（${w.id}）：${w.what}。歌詞在這個世界裡是：${w.lyricRole}。這個世界拒絕：${w.refuses.join('、')}。
層級：0 ${w.levels['0']}；1 ${w.levels['1']}；2 ${w.levels['2']}；慢歌 ${w.levels.calm}。

【版面與手法】這個世界是封閉的：layout 只能選「世界版面」的 set id，或「共用版面」的一組；其他一律退回規則版。
世界版面（layout 填 set id；enter、exit 只能選該版面列的，idle 填它的 idle；cut 一律 hold、pieces 留空、lineCam 留空）：
${sets.join('\n')}
${shared.length ? `共用版面（layout + enter + idle；整首最多 ${Math.max(1, Math.floor(n * SHARED_SHARE))} 句，程式照順序擋）：\n${shared.join('\n')}\n` : '共用版面：這個世界沒有。\n'}
【退場 exit】世界版面只能選該版面列的 exit。${pool.devices ? '共用版面可用一般退場，或有意思的退場（條件同下）。' : '共用版面只用一般退場（fade、rise、cut、shrink、drop）。'}

【ground】這句站在什麼上，只能選這個世界的，同一個不連用；自帶地面的版面留空。${grounds}。

${pool.devices ? '' : '【裝飾 decor】這個世界不畫紙面裝飾：decor 只能 none 或 fine-note（你寫的小字）。\n'}${pool.handoffs ? '' : '【換手 handoff】這個世界沒有換手：handoff 一律空字串。\n'}${pool.pace.hits.length ? `【hit】只有 ${pool.pace.hits.join('、')}，給段落第一句或最重的落拍。` : '【hit】這個世界沒有 hit：留空。'}`;
}

/**
 * The treatment the plan is laid on: the type settings and shots as the free tier builds them, with the paid concept
 * kept; the world's colours stand in for the old design's.
 */
export function worldBase(base: Record<string, any>, plan: { shots: { shot: string; lines: unknown[] }[] }, shots: { id: string; start: number; end: number }[], pw: PlanWorld) {
  const out = composerBase(base, plan, shots, pw.palette);
  return { ...out, concept: base['concept'] ?? '', design: { ...out.design, lineDirect: true, font: pw.font } };
}

/** The plan's treatment on its world: free-plan's composerTreatment, the world's face set for the renderer. */
export function worldTreatment(song: Parameters<typeof composerTreatment>[0], plan: Parameters<typeof composerTreatment>[1], base: TreatmentV3, pw: PlanWorld): TreatmentV3 {
  const w = worldById(pw.id);
  if (!w) throw new Error(`no such world: ${pw.id}`);
  const tr = composerTreatment(song, plan, base, pw.palette, w);
  tr.design = { ...tr.design!, font: pw.font };
  return tr;
}

/**
 * The story tier's drawing style on a world, when the buyer named none: the world's print and its inks, so the story's
 * sheets and frames are drawn in the world the lines live in (keyframes' board style; cutout draws in it).
 */
export function worldDrawStyle(pw: PlanWorld): string {
  const w = worldById(pw.id);
  if (!w) throw new Error(`no such world: ${pw.id}`);
  const p = pw.palette;
  return `${w.language} print look: ${w.name}, ${w.what}, ${w.provenance.process}. Flat areas in a few spot inks only: ink ${p.ink}, accent ${p.accent}, a second colour ${p.heart}, on paper ${p.paper}. Never: ${w.refuses.join('、')}.`;
}

/** The story pages on a world: its paper and inks stand in for the ones cutout's art director picked. */
export const worldPageLook = <L extends { paper: string; ink: string; accent: string }>(look: L, pw: PlanWorld): L => ({ ...look, paper: pw.palette.paper, ink: pw.palette.ink, accent: pw.palette.accent });
