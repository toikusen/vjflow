// Song structure from the lyrics and the energy curve, so the director needs no hand-written brief.
// Choruses are the lines that come back: runs of repeated lyric lines, the group that repeats most (ties: louder).
// 落ちサビ (ochi) is the quiet stretch before the last chorus, or a last chorus that starts quiet.
// ponytail: heuristics tuned on indigo and checked against the database's section labels; a learned segmenter is the
// upgrade path if these miss too often.
import type { ArcPoint, Moment } from './moments';
import type { SongTimeline, TimelineCue } from './timeline';

export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'ochi' | 'bridge' | 'interlude' | 'outro';

export interface StructSection {
  start: number;
  end: number;
  kind: SectionKind;
  /** Mean energy 0..1 over the section. */
  energy: number;
}

export interface SongStructure {
  sections: StructSection[];
  /** Chorus start times, in order. */
  choruses: number[];
  ochi?: { start: number; end: number };
}

const norm = (s: string) => s.replace(/[\s　、。,.!?！？「」『』()（）~〜…・ー\-]|[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').toLowerCase();
const bigrams = (s: string) => {
  const c = [...s];
  return c.length < 2 ? [s] : c.slice(1).map((x, i) => c[i] + x);
};

/** Dice similarity of character bigrams (0..1). */
export function lineSimilarity(a: string, b: string): number {
  const x = bigrams(norm(a));
  const y = bigrams(norm(b));
  if (!x[0] || !y[0]) return 0;
  const pool = [...y];
  let hit = 0;
  for (const g of x) {
    const k = pool.indexOf(g);
    if (k >= 0) {
      hit++;
      pool.splice(k, 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

export function energyBetween(song: SongTimeline, a: number, b: number): number {
  const e = song.energy.slice(Math.floor(a * song.energyFps), Math.max(Math.floor(a * song.energyFps) + 1, Math.floor(b * song.energyFps)));
  return e.length ? e.reduce((s, x) => s + x, 0) / e.length : 0;
}

const SIM = 0.6;
const MIN_APART = 12; // seconds: a line echoed right away is a hook inside one section, not a return

/** Indexes of choruses' first lines: start cues of the most repeated run group. */
function chorusStarts(cues: TimelineCue[], song: SongTimeline): { starts: number[]; twins: number[][] } {
  const n = cues.length;
  // which other lines does each line return as?
  const twins = cues.map((c, i) => cues.map((d, j) => j).filter((j) => j !== i && Math.abs(cues[j].start - c.start) >= MIN_APART && lineSimilarity(c.text, cues[j].text) >= SIM));
  // runs of consecutive repeated lines (one unrepeated line may sit inside a run)
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < n; i++) {
    if (twins[i].length) cur.push(i);
    else if (cur.length && i + 1 < n && twins[i + 1].length && cues[i + 1].start - cues[cur[cur.length - 1]].end < 8) cur.push(i);
    else {
      if (cur.length) runs.push(cur);
      cur = [];
    }
    // a long instrumental gap ends a run
    if (cur.length && i + 1 < n && cues[i + 1].start - cues[i].end > 5) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  // group runs that open the same way: a chorus comes back with its first line (one of its first two lines,
  // allowing a pickup line); runs that only share tail lines (a chorus's last line, a recycled verse line) stay apart
  const groupOf = runs.map((_, k) => k);
  const find = (k: number): number => (groupOf[k] === k ? k : (groupOf[k] = find(groupOf[k])));
  const head = (r: number[]) => r.slice(0, 2);
  runs.forEach((r, a) =>
    runs.forEach((s, b) => {
      if (a < b && head(r).some((i) => twins[i].some((j) => head(s).includes(j)))) groupOf[find(b)] = find(a);
    }),
  );
  const groups = new Map<number, number[][]>();
  runs.forEach((r, k) => groups.set(find(k), [...(groups.get(find(k)) ?? []), r]));
  const scored = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => {
      const lines = g.reduce((s, r) => s + r.length, 0);
      const energy = g.reduce((s, r) => s + energyBetween(song, cues[r[0]].start, cues[r[r.length - 1]].end), 0) / g.length;
      return { g, score: lines * (0.5 + energy) };
    })
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { starts: [], twins };
  // the chorus begins at the earliest line that every (or almost every) occurrence shares: a pickup or shout line that
  // only some occurrences have belongs to the pre-chorus
  const g = scored[0].g.sort((a, b) => a[0] - b[0]);
  const same = (i: number, j: number) => i === j || twins[i].includes(j);
  const shared = (i: number) => g.filter((r) => r.some((j) => same(i, j))).length;
  // a breath or shout line (「はぁ」) can return with every chorus too; the chorus starts at a sung line
  const sung = (i: number) => [...norm(cues[i].text)].length >= 3;
  const heads = g[0].filter(sung).length ? g[0].filter(sung) : g[0];
  const best = Math.max(...heads.map(shared));
  const first = heads.find((i) => shared(i) === best)!;
  const starts = g.map((r) => r.find((j) => same(first, j)) ?? r[0]);
  return { starts: [...new Set(starts)].sort((a, b) => a - b), twins };
}

/**
 * A chorus sung with new words does not repeat, so long gaps between found choruses are searched for the line where
 * the song gets as loud as the found choruses after a quieter stretch (the biggest rise), at least 30 s from both.
 */
function fillChorusGaps(starts: number[], cues: TimelineCue[], E: (a: number, b: number) => number): number[] {
  if (starts.length < 2) return starts;
  const mean = starts.reduce((s, i) => s + E(cues[i].start, cues[i].start + 8), 0) / starts.length;
  const out = [...starts];
  for (let k = 0; k + 1 < starts.length; k++) {
    const a = cues[starts[k]].start;
    const b = cues[starts[k + 1]].start;
    if (b - a < 75) continue;
    let best: { i: number; rise: number } | undefined;
    cues.forEach((c, i) => {
      if (c.start < a + 30 || c.start > b - 30) return;
      // singing that resumes after an instrumental break is a new verse, not a chorus
      if (i === 0 || c.start - cues[i - 1].end > 3) return;
      // only a well-timed, real sung line can mark it (not a short call placed by interpolation)
      if (c.confidence !== 'aligned' || [...norm(c.text)].length < 4) return;
      const after = E(c.start, c.start + 8);
      const rise = after - E(c.start - 8, c.start);
      if (after >= 0.95 * mean && rise >= 0.1 && (!best || rise > best.rise)) best = { i, rise };
    });
    if (best) out.push(best.i);
  }
  return out.sort((x, y) => x - y);
}

export function analyzeStructure(song: SongTimeline): SongStructure {
  const cues = [...song.cues].sort((a, b) => a.start - b.start);
  const dur = song.duration;
  if (!cues.length) return { sections: [{ start: 0, end: dur, kind: 'interlude', energy: energyBetween(song, 0, dur) }], choruses: [] };
  const E = (a: number, b: number) => energyBetween(song, a, b);
  const found = chorusStarts(cues, song);
  const twins = found.twins;
  const starts = fillChorusGaps(found.starts, cues, E);
  const chorusT = starts.map((i) => cues[i].start);
  const lineE = cues.map((c) => E(c.start, Math.max(c.end, c.start + 0.5)));

  // chorus span: from its first line to its last line that returns elsewhere (a bridge after it is loud too, but its
  // lines do not repeat), within 40 s and before the next chorus or a long gap
  const chorusMean = starts.length ? starts.reduce((s, i) => s + E(cues[i].start, cues[i].start + 12), 0) / starts.length : 1;
  const spans = starts.map((i, k) => {
    const limit = Math.min(k + 1 < starts.length ? cues[starts[k + 1]].start : dur, cues[i].start + 40);
    let j = i;
    let last = i;
    while (j + 1 < cues.length && cues[j + 1].start < limit && cues[j + 1].start - cues[j].end < 4) {
      j++;
      if (twins[j].length) last = j;
    }
    return { start: cues[i].start, end: cues[last].end, first: i, last };
  });

  // ochi: the longest quiet run of lines (≥ 8 s) between the previous chorus and the last one, or a quiet last chorus
  let ochi: SongStructure['ochi'];
  // 落ちサビ comes after at least two full choruses and lasts a few lines (10–30 s); a song with two choruses and a
  // long soft middle has a quiet verse, not an ochi
  if (spans.length >= 3) {
    const last = spans[spans.length - 1];
    const prev = spans[spans.length - 2];
    let best: { a: number; b: number } | undefined;
    let a = -1;
    const isQuiet = (i: number) => i < last.first && lineE[i] < 0.87 * chorusMean;
    for (let i = prev.last + 1; i <= last.first; i++) {
      // one louder line inside a quiet stretch does not end it
      const quiet = isQuiet(i) || (a >= 0 && isQuiet(i + 1) && i + 1 < last.first);
      if (quiet && a < 0) a = i;
      if ((!quiet || i === last.first) && a >= 0) {
        const b = i - 1;
        // a short tail of the previous phrase (e.g. 信じきって) is not where the quiet part begins
        while (a < b && [...norm(cues[a].text)].length <= 5 && cues[a].start - cues[a - 1].end < 0.5) a++;
        // a quiet stretch counts only if it leads into the last chorus (else it is just a soft verse)
        const leadsIn = cues[last.first].start - cues[b].end < 12; // a short build-up line may sit between them
        if (leadsIn && cues[b].end - cues[a].start >= 8 && (!best || cues[b].end - cues[a].start > cues[best.b].end - cues[best.a].start)) best = { a, b };
        a = -1;
      }
    }
    if (best && cues[best.b].end - cues[best.a].start <= 30) ochi = { start: cues[best.a].start, end: cues[best.b].end };
    else if (E(last.start, last.start + 8) < 0.85 * chorusMean) ochi = { start: last.start, end: Math.min(last.end, last.start + 16) };
  }

  // sections: intro / interludes from instrumental gaps, choruses, ochi, pre (lines leading into a chorus), verse
  const sections: StructSection[] = [];
  const push = (start: number, end: number, kind: SectionKind) => {
    if (end - start < 0.5) return;
    const prev = sections[sections.length - 1];
    if (prev && prev.kind === kind && start - prev.end < 0.6) prev.end = end;
    else sections.push({ start, end, kind, energy: 0 });
  };
  if (cues[0].start > 3) push(0, cues[0].start, 'intro');
  const kindOf = (i: number): SectionKind => {
    const t = cues[i].start;
    if (ochi && t >= ochi.start - 0.01 && t < ochi.end) return 'ochi';
    if (spans.some((s) => i >= s.first && i <= s.last)) return 'chorus';
    const next = spans.find((s) => s.first > i);
    if (next && next.start - t <= 12 && cues[next.first - 1] && i >= next.first - 3) return 'pre';
    const between = spans.length >= 2 && t >= spans[spans.length - 2].end - 0.01 && t < spans[spans.length - 1].start;
    if (spans.length && t >= spans[spans.length - 1].end - 0.01) return 'outro'; // lines after the last chorus
    return between ? 'bridge' : 'verse';
  };
  cues.forEach((c, i) => {
    const kind = kindOf(i);
    const gapBefore = i > 0 ? c.start - cues[i - 1].end : 0;
    if (i > 0 && gapBefore > 6) push(cues[i - 1].end, c.start, 'interlude');
    const startAt = i > 0 && gapBefore <= 6 ? cues[i - 1].end : c.start;
    push(sections.length ? Math.max(startAt, sections[sections.length - 1].end) : c.start, c.end, kind);
  });
  const lastEnd = cues[cues.length - 1].end;
  if (dur - lastEnd > 3) push(lastEnd, dur, 'outro');
  for (let i = 1; i < sections.length; i++) sections[i].start = sections[i - 1].end;
  if (sections[0].start > 0) sections[0].start = 0;
  sections[sections.length - 1].end = dur;
  for (const s of sections) s.energy = +E(s.start, s.end).toFixed(3);
  return { sections, choruses: chorusT, ochi };
}

const NAME: Record<SectionKind, string> = {
  intro: '前奏', verse: '主歌', pre: '導歌', chorus: '副歌', ochi: '落ちサビ', bridge: '橋段', interlude: '間奏', outro: '尾奏',
};

/** The structure in the director's language (replaces a hand-written brief's structure part). */
export function describeStructure(st: SongStructure): string {
  const secs = st.sections.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${NAME[s.kind]}（能量 ${s.energy.toFixed(2)}）`).join('；');
  const ch = st.choruses.length
    ? `副歌共 ${st.choruses.length} 次，開始於 ${st.choruses.map((t) => t.toFixed(1)).join('、')} 秒（最後一次 ${st.choruses[st.choruses.length - 1].toFixed(1)} 秒是全曲高潮）。`
    : '沒有偵測到重複的副歌。';
  const o = st.ochi ? `落ちサビ／安靜段：${st.ochi.start.toFixed(1)}–${st.ochi.end.toFixed(1)} 秒，先收再放。` : '';
  return `程式分析的歌曲結構（依歌詞重複與音量，可信度高於一般段落分析）：${secs}。${ch}${o}`;
}

const LEVEL: Record<SectionKind, number> = { intro: 0, verse: 1, pre: 2, chorus: 3, ochi: 0, bridge: 2, interlude: 1, outro: 0 };

/** Default emotional arc and moments from the structure; the director may adjust them. */
export function suggestMoments(st: SongStructure): { moments: Moment[]; arc: ArcPoint[] } {
  const arc = st.sections.map((s) => ({ start: s.start, level: LEVEL[s.kind] }));
  const moments: Moment[] = [];
  st.choruses.forEach((t, k) => {
    const last = k === st.choruses.length - 1 && st.choruses.length > 1;
    const quietLast = last && st.ochi && Math.abs(st.ochi.start - t) < 0.5;
    if (quietLast) return; // a quiet last chorus is the ochi itself; its burst comes from the break ending
    moments.push({ kind: 'build', at: t, dur: 3.5, strength: Math.min(1.3, 1 + 0.1 * k) });
    if (last && st.ochi) moments.push({ kind: 'hold', at: t, dur: 0.6, strength: 1 });
    moments.push({ kind: last ? 'finale' : 'drop', at: t, strength: Math.min(1.3, 1 + 0.1 * k) });
  });
  if (st.ochi) moments.push({ kind: 'break', at: st.ochi.start, dur: st.ochi.end - st.ochi.start, strength: 1 });
  return { moments, arc };
}
