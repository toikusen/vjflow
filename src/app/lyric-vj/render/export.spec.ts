import { describe, expect, it } from 'vitest';
import { exportBlocker } from './export-check';

describe('exportBlocker', () => {
  it('says so when the browser has no WebCodecs', () => {
    expect(exportBlocker({})).toContain('WebCodecs');
    expect(exportBlocker({ VideoEncoder: class {} })).toContain('WebCodecs');
  });
  it('lets a browser with WebCodecs through', () => {
    expect(exportBlocker({ VideoEncoder: class {}, VideoFrame: class {} })).toBeUndefined();
  });
});

describe('derived glyph pictures', () => {
  it('stay under their limit, oldest let go first', async () => {
    const { keepDerived } = await import('./text-fx');
    const map = new Map<string, { dispose(): void }>();
    let gone = 0;
    for (let i = 0; i < 300; i++) keepDerived(map, `k${i}`, { dispose: () => gone++ });
    expect(map.size).toBe(240);
    expect(gone).toBe(60);
    expect(map.has('k0')).toBe(false);
    expect(map.has('k299')).toBe(true);
  });
});

describe('frameName', () => {
  it('numbers frames so an editor reads them as one sequence', async () => {
    const { frameName } = await import('./export');
    expect([frameName('front', 0), frameName('back', 1234)]).toEqual(['front_000000.png', 'back_001234.png']);
  });
});
