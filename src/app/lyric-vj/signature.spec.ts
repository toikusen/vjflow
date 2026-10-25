import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from './design';
import type { GraphicsLook, Layer } from './render/graphics';
import { applySignature, chorusSections, Signature, signatureErrors, signatureFromDirector, stripSignature } from './signature';
import { TEMPLATES } from './templates';
import { SongTimeline } from './timeline';
import { TreatmentV3, validateTreatment } from './treatment';

const SIGS: Record<string, Signature> = {
  sea: { image: '小島海岸的一天一夜', scene: 'sea', horizon: 0.5, chorusHorizon: 0.62, picture: 'band' },
  space: { image: '繞著行星的衛星', scene: 'space', picture: 'keep' },
  round: { image: '天文台與圓圓的地球', scene: 'none', picture: 'circle', layout: 'round' },
  bank: { image: '盛夏的河堤', scene: 'riverbank', horizon: 0.38, chorusHorizon: 0.3, picture: 'band', chorusPicture: 'full', layout: 'linear', ink: '#3A57A8' },
  land: { image: '山城', scene: 'land', horizon: 0.45 },
};
const PAPER: Layer = { kind: 'paper', color: '#F5EFE4' };
const SKY: Layer = { kind: 'bands', colors: ['#111111', '#333333', '#555555'], from: 0, to: 0.6 };
const HILLS: Layer = { kind: 'skyline', type: 'hills', colors: ['#222222', '#111111'] };
const MOON: Layer = { kind: 'blob', x: 0.7, y: 0.4, r: 0.06, color: '#FFF1C2' };
const RINGS: Layer = { kind: 'rings', x: 0, y: 0, color: '#FFFFFF' };
const PHOTO: Layer = { kind: 'photo', mode: 'circle', asset: 'a1', x: 0.3, y: 0.2, w: 0.27 };
const look = (...sections: Layer[][]): GraphicsLook => ({ sections: sections.map((layers, i) => ({ start: i * 10, layers })) });
const marked = (l: Layer) => !!(l as { sig?: string }).sig;

describe('signatureErrors', () => {
  it('accepts a whole signature and none at all', () => {
    for (const s of Object.values(SIGS)) expect(signatureErrors(s)).toEqual([]);
    expect(signatureErrors(undefined)).toEqual([]);
  });

  it('names each wrong type, range and value', () => {
    expect(signatureErrors('sea')).toEqual(['signature 必須是物件']);
    const e = signatureErrors({ image: '', scene: 'forest', horizon: 0.9, chorusHorizon: '0.5', picture: 'poster', layout: 'grid', ink: 'blue', font: 'x' });
    expect(e).toEqual([
      'signature 沒有欄位 font',
      'signature.image 必須是一句描述這首歌場景的文字',
      'signature.scene 必須是 sea／space／riverbank／land／none 之一',
      'signature.horizon 必須是 0.25–0.75 的數字',
      'signature.chorusHorizon 必須是 0.25–0.75 的數字',
      'signature.picture 必須是 keep／band／circle／full 之一',
      'signature.layout 必須是 round／linear／free 之一',
      'signature.ink 必須是 #rrggbb',
    ]);
    // a ground at a height needs the height
    expect(signatureErrors({ image: 'x', scene: 'sea' })).toEqual(['signature.scene sea 需要 horizon']);
  });
});

describe('chorusSections', () => {
  const secs = [{ start: 27.5 }, { start: 53.6 }, { start: 88.5 }];
  it('gives a drop just before a section start to that section, not the one before (世界のつづき 53.59 s)', () => {
    expect(chorusSections(secs, [{ kind: 'drop', at: 53.59 }])).toEqual([false, true, false]);
  });
  it('counts a drop, hold or finale inside a section and the top of the arc; not builds or breaks', () => {
    expect(chorusSections(secs, [{ kind: 'build', at: 40 }, { kind: 'break', at: 60 }])).toEqual([false, false, false]);
    expect(chorusSections(secs, [{ kind: 'finale', at: 90 }])).toEqual([false, false, true]);
    expect(chorusSections(secs, [], [{ start: 30, level: 3 }, { start: 60, level: 2 }])).toEqual([true, false, false]);
  });
});

describe('applySignature', () => {
  const two = () => look([PAPER, SKY, HILLS, MOON, PHOTO], [PAPER, SKY, MOON, PHOTO]);
  const drop = [{ kind: 'drop' as const, at: 10 }];

  it('never modifies its input, strips back to it exactly, and applying twice equals applying once', () => {
    const l = two();
    const before = structuredClone(l);
    for (const s of Object.values(SIGS)) {
      const once = applySignature(l, s, drop);
      expect(l).toEqual(before);
      expect(stripSignature(once)).toEqual(before);
      expect(applySignature(once, s, drop)).toEqual(once);
    }
  });

  it('leaves a story frame whole whatever the song\'s picture role', () => {
    const frame: Layer = { kind: 'photo', mode: 'full', asset: 'kf_1', own: true };
    const [a] = applySignature(look([PAPER, frame]), SIGS['round']).sections;
    expect(a.layers).toContainEqual(frame);
  });

  it('keeps the director’s own objects and replaces only the sky bands and the ground silhouette', () => {
    const [a] = applySignature(look([PAPER, SKY, HILLS, MOON, RINGS, PHOTO]), SIGS['space']).sections;
    expect(a.layers).toContainEqual(MOON);
    expect(a.layers).toContainEqual(RINGS);
    expect(a.layers).toContainEqual(PHOTO); // keep: exactly as placed
    expect(a.layers).not.toContainEqual(SKY);
    expect(a.layers).not.toContainEqual(HILLS);
  });

  it('leaves a section without sky bands as it was, and changes no ground for scene none', () => {
    const [a] = applySignature(look([PAPER, HILLS, MOON]), SIGS['sea']).sections;
    expect(a.layers).toEqual([PAPER, HILLS, MOON]);
    const [b] = applySignature(look([PAPER, SKY, HILLS]), SIGS['round']).sections;
    expect(b.layers).toEqual([PAPER, SKY, HILLS]);
  });

  it('adds a planet as ground (never moved), unless the director already has one at the bottom', () => {
    const [a] = applySignature(look([PAPER, SKY]), SIGS['space']).sections;
    expect(a.layers.find((l) => l.kind === 'blob')?.fixed).toBe(true);
    const planet: Layer = { kind: 'blob', x: 0, y: -1.05, r: 0.62, color: '#F4A257' };
    const [b] = applySignature(look([PAPER, SKY, planet]), SIGS['space']).sections;
    expect(b.layers.filter((l) => l.kind === 'blob')).toEqual([planet]);
  });

  it('lifts the chorus only in its own section, and a chorus may keep the verse horizon', () => {
    const l = look([PAPER, SKY, MOON], [PAPER, SKY, MOON]);
    const [verse, chorus] = applySignature(l, SIGS['sea'], [{ kind: 'drop', at: 9.99 }]).sections;
    const sun = (s: { layers: Layer[] }) => s.layers.find((x) => x.kind === 'blob') as Extract<Layer, { kind: 'blob' }>;
    expect(sun(verse)).toEqual(MOON); // the verse keeps its own small moon
    expect(sun(chorus).r).toBe(0.3); // the chorus sun rises on the horizon
    const flat = applySignature(l, { ...SIGS['sea'], chorusHorizon: undefined }, drop).sections;
    const skyTo = (s: { layers: Layer[] }) => (s.layers.find((x) => x.kind === 'bands') as Extract<Layer, { kind: 'bands' }>).to;
    expect(skyTo(flat[0])).toBe(skyTo(flat[1]));
  });

  it('adds a rail to a linear chorus only when the director drew no long line there', () => {
    const drop = [{ kind: 'drop' as const, at: 10 }];
    const rails = (l: GraphicsLook) => l.sections.map((x) => x.layers.filter((y) => y.kind === 'band' && (y as { sig?: string }).sig === 'added').length);
    // the verse gets none, the bare chorus gets one
    expect(rails(applySignature(look([PAPER, SKY], [PAPER, SKY]), SIGS['bank'], drop))).toEqual([0, 1]);
    // a chorus with the director's own stripe, slanted or level, keeps it alone
    const slant: Layer = { kind: 'band', type: 'tape', y: 0.55, angle: -8, height: 44, color: '#F2C14E' };
    const level: Layer = { kind: 'band', type: 'tape', y: -0.32, angle: 0, height: 30, color: '#F2C14E' };
    expect(rails(applySignature(look([PAPER, SKY], [PAPER, SKY, slant]), SIGS['bank'], drop))).toEqual([0, 0]);
    expect(rails(applySignature(look([PAPER, SKY], [PAPER, SKY, level]), SIGS['bank'], drop))).toEqual([0, 0]);
  });

  it('adds no sea where the director already drew one from the horizon down', () => {
    const sea: Layer = { kind: 'bands', colors: ['#0A2A44', '#123A5A'], from: 0.5, to: 1 };
    const [a] = applySignature(look([PAPER, SKY, sea]), SIGS['sea']).sections;
    expect(a.layers.filter((l) => l.kind === 'bands' && (l as { sig?: string }).sig === 'added')).toEqual([{ kind: 'bands', colors: (SKY as Extract<Layer, { kind: 'bands' }>).colors, from: 0, to: 0.5, sig: 'added' }]);
    expect(a.layers).toContainEqual(sea);
  });

  it('sets only the sky height on the director’s own land', () => {
    const [a] = applySignature(look([PAPER, SKY, HILLS]), SIGS['land']).sections;
    expect(a.layers).toContainEqual(HILLS);
    expect((a.layers[1] as Extract<Layer, { kind: 'bands' }>).to).toBe(0.45);
  });
});

describe('the six benchmark treatments (testdata/benchmark)', () => {
  const NAMES = ['sou-setsu-kon', 'platonic-choroin', 'tenmon-taiwa', 'sekai-no-tsuzuki', 'utsusemi', 'kousei'];
  const load = (n: string) => JSON.parse(readFileSync(`src/app/lyric-vj/testdata/benchmark/${n}.json`, 'utf8')) as TreatmentV3;

  it('all six are there', () => {
    expect(NAMES.map((n) => load(n).graphics?.sections.length ?? 0).every((k) => k >= 3)).toBe(true);
  });

  it('every signature strips back to each director look exactly, and is idempotent on it', () => {
    for (const n of NAMES) {
      const t = load(n);
      for (const s of Object.values(SIGS)) {
        const once = applySignature(t.graphics!, s, t.moments, t.arc);
        expect(stripSignature(once), n).toEqual(t.graphics);
        expect(applySignature(once, s, t.moments, t.arc), n).toEqual(once);
        // every director layer is still there, as drawn or kept under its mark
        const kept = once.sections.flatMap((x) => x.layers.filter((l) => !marked(l)).length + x.layers.filter((l) => (l as { sig?: string }).sig === 'changed').length + ((x as { sigRemoved?: unknown[] }).sigRemoved?.length ?? 0));
        expect(kept, n).toEqual(t.graphics!.sections.map((x) => x.layers.length));
      }
    }
  });
});

describe('validateTreatment with a signature', () => {
  const song: SongTimeline = {
    title: 't', duration: 30, tempo: 120,
    beats: Array.from({ length: 60 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 15 }, (_, i) => i * 2),
    sections: [], energy: [], energyFps: 10,
    cues: [{ id: 'c001', start: 10.1, end: 12.9, text: '光る星', timingSource: 'lrclib', confidence: 'verified' }],
    audio: { mix: 'm.mp3' },
  };
  const win = { start: 10, end: 20 };
  const base = (signature?: unknown): TreatmentV3 => ({
    concept: 'c',
    styleAnchor: { prompt: 'p', palette: { background: '#000000', text: '#ffffff', accent: '#00ffff', line: '#ffffff', glow: '#4488ff' } },
    assets: [{ id: 'a1', kind: 'image', prompt: 'sea' }],
    shots: [{ id: 's1', start: 10, end: 20, template: 'punch', params: {}, asset: 'a1', camera: 'push', transitionIn: 'cut' }],
    cues: [{ cueId: 'c001', shot: 's1', enter: 'slam', exit: 'burst' }],
    design: { ...structuredClone(DEFAULT_DESIGN), ...(signature !== undefined ? { signature: signature as Signature } : {}) },
    graphics: { sections: [{ start: 10, layers: [PAPER, SKY, HILLS, PHOTO] }] },
  });

  it('leaves a treatment without a signature as it was', () => {
    const r = validateTreatment(base(), song, win, TEMPLATES);
    expect(r.treatment.graphics).toEqual(base().graphics);
    expect(r.treatment.design?.signature).toBeUndefined();
  });

  it('keeps the signature through the design check and applies it', () => {
    const r = validateTreatment(base(SIGS['sea']), song, win, TEMPLATES);
    expect(r.errors).toEqual([]);
    expect(r.treatment.design?.signature).toEqual(SIGS['sea']);
    expect(r.treatment.graphics!.sections[0].layers.some(marked)).toBe(true);
    // validating the result again changes nothing (no second application)
    expect(validateTreatment(r.treatment, song, win, TEMPLATES).treatment.graphics).toEqual(r.treatment.graphics);
  });

  it('reports a wrong signature and does not apply it', () => {
    const r = validateTreatment(base({ image: 'x', scene: 'forest' }), song, win, TEMPLATES);
    expect(r.errors).toContain('signature.scene 必須是 sea／space／riverbank／land／none 之一');
    expect(r.treatment.design?.signature).toBeUndefined();
    expect(r.treatment.graphics).toEqual(base().graphics);
  });
});

describe('signatureFromDirector', () => {
  it('leaves out the fields the director filled with null, and passes the rest on to be checked', () => {
    const out = signatureFromDirector({ image: '行星', scene: 'space', horizon: null, chorusHorizon: null, picture: 'keep', chorusPicture: 'keep', layout: 'round', ink: null });
    expect(out).toEqual({ image: '行星', scene: 'space', picture: 'keep', chorusPicture: 'keep', layout: 'round' });
    expect(signatureErrors(out)).toEqual([]);
    expect(signatureFromDirector(null)).toBeUndefined();
    // a wrong value is not repaired here: signatureErrors names it
    expect(signatureErrors(signatureFromDirector({ image: 'x', scene: 'sea', horizon: 1.2 }))).toEqual(['signature.horizon 必須是 0.25–0.75 的數字']);
  });
});

describe('signature over a skyline', () => {
  it('prints a framed photo normally where a skyline is (the signed look passes the layer check)', () => {
    const inked: Layer = { kind: 'photo', mode: 'full', asset: 'a1', blend: 'multiply' } as Layer;
    const [s] = applySignature(look([PAPER, SKY, HILLS, inked]), { image: '夕方の街', scene: 'land', horizon: 0.5, picture: 'band' }).sections;
    const photo = s.layers.find((l) => l.kind === 'photo') as { mode: string; blend?: string };
    expect(photo.mode).toBe('band');
    expect(photo.blend).toBeUndefined();
  });
});

describe('signature on a drawn section', () => {
  it('adds no chorus rail where the code layer lays the frame out itself', () => {
    const code = { kind: 'code', src: '', cuts: [] } as unknown as Layer;
    const drop = [{ kind: 'drop', at: 5, strength: 1 }] as never;
    const [drawn] = applySignature(look([PAPER, code]), SIGS['bank'], drop).sections;
    expect(drawn.layers.some((l) => l.kind === 'band')).toBe(false);
    const [plain] = applySignature(look([PAPER, SKY]), SIGS['bank'], drop).sections;
    expect(plain.layers.some((l) => l.kind === 'band')).toBe(true);
  });
});
