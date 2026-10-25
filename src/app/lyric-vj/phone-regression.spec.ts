import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { varyComposition } from './compose';
import { DEFAULT_DESIGN } from './design';
import { STYLES, checkStyle } from './styles';
import { analyzeStructure, chorusSpans } from './structure';
import { TEMPLATES } from './templates';
import { SongTimeline } from './timeline';
import { TreatmentV3, validateTreatment } from './treatment';

// 天文対話's second paid phone run, the director's shot plan as it came back (testdata/phone): the checks it slipped
// through then must catch it now, without paying for another run
const read = <T>(f: string) => JSON.parse(readFileSync(`src/app/lyric-vj/testdata/phone/${f}`, 'utf8')) as T;
const song = read<SongTimeline>('tenmon-song.json');
const win = { start: 0, end: song.duration };
const plan = () => validateTreatment(read<TreatmentV3>('tenmon-auto2-draft.json'), song, win, TEMPLATES).treatment;

describe('天文対話 phone plan (2026-10-14 paid run 2)', () => {
  it('is sent back for the fast lines it put in input fields', () => {
    const errs = checkStyle(plan(), STYLES['emotional'], song, win, 'still').join('\n');
    expect(errs).toMatch(/唱得太快/);
    for (const id of ['c010', 'c011', 'c035']) expect(errs).toContain(id);
  });

  it('keeps its notifications and input fields through the quiet pass', () => {
    const t = plan();
    t.design = { ...DEFAULT_DESIGN, language: 'phone', techniques: ['skeleton', 'quiet'] };
    varyComposition(t, chorusSpans(analyzeStructure(song)));
    const tpl = (id: string) => t.shots.find((s) => s.id === id)?.template;
    expect([tpl('s12'), tpl('s13'), tpl('s15')]).toEqual(['notify', 'notify', 'input']);
  });
});
