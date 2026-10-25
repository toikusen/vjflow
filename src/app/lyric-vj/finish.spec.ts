import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finishDesign } from './finish';
import type { LanguageId } from './languages';
import type { GraphicsLook, Layer } from './render/graphics';
import { Signature, stripSignature } from './signature';
import { analyzeStructure, chorusSpans } from './structure';
import { TEMPLATES } from './templates';
import { SongTimeline } from './timeline';
import { TreatmentV3, validateTreatment } from './treatment';

// the six benchmark songs as the director left them (testdata/benchmark), four with a hand-written signature
const SONGS: [string, Signature | undefined][] = [
  ['sekai-no-tsuzuki', { image: '小島海岸的一天一夜', scene: 'sea', horizon: 0.5, chorusHorizon: 0.62, picture: 'band' }],
  ['kousei', { image: '繞著行星的衛星', scene: 'space', picture: 'keep' }],
  ['tenmon-taiwa', { image: '天文台與圓圓的地球', scene: 'none', picture: 'circle', layout: 'round' }],
  ['utsusemi', { image: '盛夏的河堤', scene: 'riverbank', horizon: 0.38, chorusHorizon: 0.3, picture: 'band', chorusPicture: 'full', layout: 'linear', ink: '#3A57A8' }],
  ['sou-setsu-kon', undefined],
  ['platonic-choroin', undefined],
];
const read = <T>(p: string) => JSON.parse(readFileSync(`src/app/lyric-vj/testdata/benchmark/${p}.json`, 'utf8')) as T;
const marks = (l: Layer) => (l as { sig?: string }).sig;

/** The director's design pass as direct.mts runs it: validate, then finish (clean-up, signature, sides). */
function designFlow(name: string, sig: Signature | undefined) {
  const song = read<SongTimeline>(`songs/${name}`);
  const t0 = read<TreatmentV3>(name);
  if (sig) t0.design = { ...t0.design!, signature: sig };
  else delete t0.design?.signature;
  const win = { start: 0, end: song.duration };
  const checked = validateTreatment(t0, song, win, TEMPLATES);
  const fin = finishDesign(checked.treatment, { language: t0.design!.language as LanguageId, choruses: chorusSpans(analyzeStructure(song)), cues: song.cues, duration: song.duration, music: song.sections, start: win.start });
  return { song, win, t: checked.treatment, errors: fin.errors };
}

describe('a kept story (--keep-story)', () => {
  it('is the story laid out, saved and loaded, and every prop it uses is one already drawn', () => {
    const song = read<SongTimeline>('songs/sekai-no-tsuzuki');
    const original = read<TreatmentV3>('sekai-no-tsuzuki');
    const win = { start: 0, end: song.duration };
    // a new design that came with another story: its own props, not drawn yet
    const t0 = structuredClone(original);
    t0.design = { ...t0.design!, signature: SONGS[0][1] };
    t0.graphics = { ...t0.graphics!, story: [{ kind: 'pop', prop: 'boat.sail', at: 30, dur: 5, x: 0.5, y: 0, size: 0.2 }], storyProps: [{ id: 'boat.sail', what: 'a sail boat', hero: false }] };
    const checked = validateTreatment(t0, song, win, TEMPLATES).treatment;
    const kept = { story: original.graphics!.story, storyProps: original.graphics!.storyProps };
    const fin = finishDesign(checked, { language: 'silkscreen', choruses: chorusSpans(analyzeStructure(song)), cues: song.cues, duration: song.duration, music: song.sections, start: win.start, story: kept });
    expect(fin.errors).toEqual([]);
    expect(checked.graphics!.story).toEqual(kept.story);
    const drawn = new Set((kept.storyProps ?? []).map((p) => p.id));
    const used = (checked.graphics!.story ?? []).flatMap((it) => ('prop' in it ? [it.prop] : 'props' in it && Array.isArray(it.props) ? it.props : []));
    expect(used.filter((p) => !drawn.has(p))).toEqual([]);
    const again = validateTreatment(JSON.parse(JSON.stringify(checked)), song, win, TEMPLATES).treatment;
    expect(again.graphics).toEqual(checked.graphics);
  });
});

describe('the design flow with a signature: finish, save, load and validate again', () => {
  for (const [name, sig] of SONGS)
    it(`${name}${sig ? ` (${sig.scene})` : ' (no signature)'}`, () => {
      const { song, win, t, errors } = designFlow(name, sig);
      expect(errors).toEqual([]);
      // saved and loaded as the renderer does: validated again, the look is the same (signed once, not twice)
      const saved: TreatmentV3 = JSON.parse(JSON.stringify(t));
      const again = validateTreatment(saved, song, win, TEMPLATES).treatment;
      expect(again.graphics).toEqual(t.graphics);
      expect(again.design?.signature).toEqual(sig);
      // the signature's own layers at most once per section: two sky bands for a sea, a planet, one rail
      for (const s of t.graphics?.sections ?? []) {
        const own = s.layers.filter((l) => marks(l) === 'added');
        expect(own.filter((l) => l.kind === 'bands').length).toBeLessThanOrEqual(2);
        expect(own.filter((l) => l.kind === 'blob').length).toBeLessThanOrEqual(1);
        expect(own.filter((l) => l.kind === 'band').length).toBeLessThanOrEqual(1);
      }
      // the director's look under the signature is the look the same flow makes without one: the signature drops no
      // layer and no picture of its own accord
      const plain = designFlow(name, undefined).t.graphics as GraphicsLook;
      expect(stripSignature(t.graphics)).toEqual(plain);
      const assets = (g?: GraphicsLook) => (g?.sections ?? []).flatMap((s) => s.layers.flatMap((l) => (l.kind === 'photo' && l.asset ? [l.asset] : []))).sort();
      expect(assets(t.graphics)).toEqual(assets(plain));
      // signed songs are signed; no signature, no marks
      expect((t.graphics?.sections ?? []).some((s) => s.layers.some(marks))).toBe(!!sig);
    });
});

describe('interfaceText', () => {
  it('takes caption effects off the lines in a phone\'s chat and leaves other templates alone', async () => {
    const { interfaceText } = await import('./finish');
    const t = {
      shots: [{ id: 's1', template: 'chat' }, { id: 's2', template: 'punch' }],
      cues: [
        { cueId: 'a', shot: 's1', enter: 'focus', exit: 'fade', reveal: 'word', accents: [0], emphasis: [{ from: 0, to: 2, method: 'scale' }, { from: 3, to: 4, method: 'color' }] },
        { cueId: 'b', shot: 's2', enter: 'slam', exit: 'burst', emphasis: [{ from: 0, to: 2, method: 'scale' }] },
      ],
    } as unknown as TreatmentV3;
    expect(interfaceText(t, 'phone')).toHaveLength(1);
    expect(t.cues[0]).toEqual({ cueId: 'a', shot: 's1', enter: 'cut', exit: 'cut', reveal: 'line', emphasis: [{ from: 3, to: 4, method: 'color' }] });
    expect(t.cues[1].enter).toBe('slam');
    expect(interfaceText(t, 'pictogram')).toEqual([]);
  });
});

describe('callBoard', () => {
  it('puts a calls board in every section of idol Live and none elsewhere', async () => {
    const { callBoard } = await import('./finish');
    const t = { styleAnchor: { palette: { accent: '#FF5FA2' } }, graphics: { sections: [
      { start: 0, accent: '#3EC6FF', layers: [{ kind: 'fill', color: '#000000' }] },
      { start: 10, layers: [{ kind: 'led', color: '#FFD93D', text: 'x' }] },
    ] } } as never;
    expect(callBoard(structuredClone(t), 'phone')).toEqual([]);
    const idol = structuredClone(t) as { graphics: { sections: { layers: Record<string, unknown>[] }[] } };
    expect(callBoard(idol as never, 'idol-live', 'iLiFE! - i REVOLUTION')).toHaveLength(1);
    expect(idol.graphics.sections[0].layers[1]).toMatchObject({ kind: 'led', calls: true, color: '#3EC6FF', text: 'iLiFE! - i REVOLUTION' });
    expect(idol.graphics.sections[1].layers).toEqual([{ kind: 'led', color: '#FFD93D', text: 'x', calls: true }]);
  });
});

describe('storyboard shots', () => {
  it('are left exactly as the storyboard made them by every finishing pass', async () => {
    const { finishDesign } = await import('./finish');
    const t = {
      concept: 'c', styleAnchor: { prompt: '', palette: { background: '#000000', text: '#ffffff', accent: '#ff0000', line: '#ffffff', glow: '#ffffff' } }, assets: [],
      shots: [
        { id: 's1', start: 0, end: 10, template: 'punch', params: {}, camera: 'static', transitionIn: 'cut' },
        { id: 'sb-x', start: 10, end: 20, template: 'scene', params: { scene: 'x' }, camera: 'static', transitionIn: 'cut' },
      ],
      cues: [
        { cueId: 'c1', shot: 's1', enter: 'cut', exit: 'cut' },
        { cueId: 'c2', shot: 'sb-x', enter: 'cut', exit: 'cut', reveal: 'line' },
        { cueId: 'c3', shot: 'sb-x', enter: 'cut', exit: 'cut', reveal: 'line' },
      ],
      storyboard: [{ id: 'x', start: 10, end: 20, intent: 'i', parts: [{ id: 'p', kind: 'band', z: 0, lines: [{ cueId: 'c2', role: 'lead' }, { cueId: 'c3', role: 'lead' }] }] }],
      graphics: { sections: [{ start: 0, layers: [{ kind: 'fill', color: '#000000' }] }] },
      design: { language: 'idol-live' },
    };
    const before = structuredClone({ shots: t.shots.filter((s) => s.template === 'scene'), cues: t.cues.filter((c) => c.shot === 'sb-x') });
    // two quick lines: a stacking pass would merge them, a side pass would move them
    const cues = [{ id: 'c1', start: 1, end: 3, text: 'あいうえお' }, { id: 'c2', start: 10, end: 10.6, text: '燃やせ！' }, { id: 'c3', start: 10.7, end: 11.2, text: '下剋上なvibes!' }];
    const r = finishDesign(t as never, { language: 'idol-live', choruses: [{ start: 10, end: 20 }], cues, duration: 20, start: 0 });
    expect({ shots: t.shots.filter((s) => s.template === 'scene'), cues: t.cues.filter((c) => c.shot === 'sb-x') }).toEqual(before);
    expect(r.fixes.join('\n')).toMatch(/分鏡鏡頭（2 句）鎖定/);
    // no stock call board added over a storyboard
    expect(JSON.stringify(t.graphics)).not.toMatch(/"calls":true/);
  });
});
