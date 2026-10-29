import { describe, expect, it } from 'vitest';
import { FONTS } from './fonts';
import { interfaceLook, keepOwnMotifs, LANGUAGES, lookChanges, PROVEN_LANGUAGES } from './languages';
import { TEMPLATES } from './templates';

describe('design languages', () => {
  it('offers the director only the user-approved ones (cel80s on sweet timer came out unusable)', () => {
    expect([...PROVEN_LANGUAGES].sort()).toEqual(['dossier', 'pictogram', 'risograph', 'silkscreen', 'spy-titles']);
  });
  it('shelves the looks judged unfit or duplicate on 2026-10-29; a shelved language is never proven', () => {
    const shelved = Object.entries(LANGUAGES).filter(([, l]) => l.shelved).map(([id]) => id).sort();
    expect(shelved).toEqual(['aizome', 'art-deco', 'cel80s', 'citypop', 'claymation', 'cyanotype', 'dark-glitch', 'hologram', 'ink-wash', 'neon-stage', 'stained-glass', 'watercolor']);
    expect(shelved.filter((id) => PROVEN_LANGUAGES.includes(id as never))).toEqual([]);
  });
  it('use only catalog fonts and real templates, and each says how to draw it', () => {
    const fonts = new Set(FONTS.map((f) => f.family));
    for (const [id, l] of Object.entries(LANGUAGES)) {
      expect(l.fonts.filter((f) => !fonts.has(f)), id).toEqual([]);
      expect(l.templates.filter((t) => !(t in TEMPLATES)), id).toEqual([]);
      expect(l.craft.length, id).toBeGreaterThan(200);
    }
  });

  it('build their recipes from layers and patterns the renderer has (the 2026-10-14 styles brought new ones)', async () => {
    const { LAYER_KINDS } = await import('./render/graphics');
    const { KIT_PATTERNS } = await import('./render/kit');
    const kinds = new Set<string>(LAYER_KINDS);
    const patterns = new Set<string>(['grid', 'dots', 'stripes', 'gingham', 'checker', 'halftone', 'waves', 'genkou', 'shibori', 'itajime', ...KIT_PATTERNS]);
    for (const [id, l] of Object.entries(LANGUAGES)) {
      // each step of a recipe opens with a layer kind (or a bare pattern type): 'fill（…）→ pattern lined（…）→ phone（…）'
      const named = [...l.layers.matchAll(/(?:^|→\s*)([a-z]+)/g)].map((m) => m[1]);
      expect(named.filter((k) => !kinds.has(k) && !patterns.has(k)), id).toEqual([]);
      const used = [...l.layers.matchAll(/pattern ([a-z]+)/g)].map((m) => m[1]);
      expect(used.filter((p) => !patterns.has(p)), id).toEqual([]);
    }
  });

  it('each draws its props in its own medium (one shared flat style made every song look alike)', () => {
    const styles = Object.entries(LANGUAGES).map(([id, l]) => [id, l.props?.style ?? ''] as const);
    for (const [id, style] of styles) expect(style.length, id).toBeGreaterThan(120);
    expect(new Set(styles.map(([, s]) => s)).size).toBe(styles.length);
  });

  it('strips shared decorations a language does not own, and echo next to a motif', () => {
    const t = {
      design: {} as { techniques?: string[] },
      motif: undefined as unknown,
      graphics: { sections: [{ layers: [{ kind: 'paper' }, { kind: 'rings' }, { kind: 'pattern', type: 'waves' }, { kind: 'particles', shape: 'heart' }, { kind: 'stamp' }] }] },
      cues: [{ emphasis: [{ method: 'face' }, { method: 'symbol', symbol: 'heart' }, { method: 'scale' }] }],
    };
    const fixes = keepOwnMotifs(t, 'aizome');
    expect(t.graphics.sections[0].layers.map((l) => l.kind)).toEqual(['paper']);
    expect(t.cues[0].emphasis.map((e) => e.method)).toEqual(['scale']);
    expect(t.design.techniques).not.toContain('echo');
    expect(fixes.length).toBeGreaterThan(3);
    const r = { ...t, design: {}, graphics: { sections: [{ layers: [{ kind: 'stamp' }, { kind: 'rings' }] }] }, cues: [] };
    keepOwnMotifs(r, 'risograph');
    expect(r.graphics.sections[0].layers.map((l) => l.kind)).toEqual(['stamp']);
    const s = { design: { techniques: ['echo', 'quiet'] }, motif: { kind: 'orbit' }, shots: [{ params: { echo: true, dim: 0.3 } }], cues: [] };
    keepOwnMotifs(s, 'swiss');
    expect(s.design.techniques).toEqual(['quiet']);
    expect(s.shots[0].params).toEqual({ dim: 0.3 });
  });

  it('takes the photos out of a drawn-only look', () => {
    const t = { shots: [{ params: {}, asset: 'img_a' }] as { params: Record<string, unknown>; asset?: string }[], assets: [{ id: 'img_a' }], cues: [] };
    keepOwnMotifs(t, 'terminal');
    expect(t.shots[0].asset).toBeUndefined();
    expect(t.assets).toEqual([]);
  });
});

describe('phone photos', () => {
  it('keeps only the photos a chat sends, and no other picture', () => {
    const t = {
      design: {},
      assets: [{ id: 'roof' }, { id: 'selfie' }],
      shots: [{ asset: 'roof', params: {} }, { params: { attachKind: 'photo', attach: 'selfie' } }],
      graphics: { sections: [{ layers: [{ kind: 'photo', mode: 'full' }, { kind: 'app' }] }] },
      cues: [],
    };
    keepOwnMotifs(t as never, 'phone');
    expect(t.assets).toEqual([{ id: 'selfie' }]);
    expect(t.shots[0].asset).toBeUndefined();
    expect(t.graphics.sections[0].layers.map((l) => l.kind)).toEqual(['app']);
  });
});

describe('phone looks', () => {
  it('reads a design\'s look and counts what changed from another song\'s', () => {
    const app = (skin: string, color: string, accent: string) => ({ sections: [{ layers: [{ kind: 'app', skin, color, accent }] }] });
    const a = interfaceLook({ shots: [{ template: 'chat', params: { corner: 1 } }, { template: 'input', params: {} }], graphics: app('dark', '#1b2233', '#06c755'), design: { font: 'M PLUS Rounded 1c' } });
    expect(a).toEqual({ direction: 'C', skin: 'dark', wallpaper: '#1B2233', bubble: '#06C755', corner: '1', font: 'M PLUS Rounded 1c' });
    const b = interfaceLook({ shots: [{ template: 'chat', params: { corner: 0.4 } }], graphics: { sections: [{ layers: [{ kind: 'fill' }] }] }, design: { font: 'Zen Maru Gothic', colorScript: [{ accent: '#5ac8fa' }] } });
    expect(b.direction).toBe('B');
    expect(lookChanges(a, b)).toBe(6);
    expect(lookChanges(a, { ...a, corner: '0.5' })).toBe(1);
  });
});
