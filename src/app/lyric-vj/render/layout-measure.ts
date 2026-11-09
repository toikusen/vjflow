// The renderer's measure as the plan can call it (Q1 phase 3c, docs/research/2026-11-10-q1-phase3c.md). The world layout
// measures a line's characters one by one in its face (world-layout measureOf → glyphs.ts advanceOf: canvas measureText
// at size 100, the weight nearest 700), which needs the browser and the face loaded. The plan has neither, so the same
// advances are kept here as a table, read in the renderer's own browser from the self-hosted faces (scripts/lyric-vj/
// advance-table.mts). What the table does not hold falls to a rule: CJK, kana and full-width an em (as the worlds' faces
// set them), anything else a guess by shape.
import { ADVANCE_TABLE } from './advance-table';
import type { Measure } from './world-sets';

/** The rule's advance of one character at size 100: an em for CJK, kana and full-width, else by shape (a space a quarter em). */
export const ruleAdvance = (ch: string): number =>
  /[　-鿿＀-￯]/.test(ch) ? 100 : /\s/.test(ch) ? 28 : /[ilIj.,:;'!|]/.test(ch) ? 26 : /[mwMW]/.test(ch) ? 84 : /[A-Z]/.test(ch) ? 66 : 54;

const tables = new Map<string, Map<string, number>>();
const tableOf = (family: string) => {
  let t = tables.get(family);
  if (!t) {
    const [chars, values] = ADVANCE_TABLE[family] ?? ['', ''];
    const vs = values ? values.split(',').map(Number) : [];
    t = new Map([...chars].map((c, i) => [c, vs[i]]));
    tables.set(family, t);
  }
  return t;
};

/** Whether the table holds a family (a face of fonts.ts it was read for). */
export const measuredFamily = (family: string | undefined) => !!family && family in ADVANCE_TABLE;

/**
 * A family's advances at size 100 summed over a string, as the world layout measures it in the browser: the table's
 * reading where it has one, else the rule. Deterministic: the scheduler and the renderer's geometry call it alike.
 */
export function layoutMeasure(family: string): Measure {
  const t = tableOf(family);
  return (x: string) => [...x].reduce((w, ch) => w + (t.get(ch) ?? ruleAdvance(ch)), 0);
}
