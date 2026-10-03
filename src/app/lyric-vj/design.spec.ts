import { describe, expect, it } from 'vitest';
import { colorAt, validateDesign } from './design';

describe('validateDesign', () => {
  it('repairs font, ranges and colour stops', () => {
    const { design, fixes } = validateDesign(
      {
        font: 'Comic Sans',
        kanaScale: 0.2,
        grain: 3,
        paper: 0.5,
        colorScript: [
          { start: 30, shadow: '#101020', highlight: '#f0f0ff', accent: '#ff3366', duotone: 1.4 },
          { start: 10, shadow: 'red', highlight: '#fff', accent: '#000', duotone: 0.5 },
        ],
      },
      { start: 0, end: 60 },
    );
    expect(design.font).toBe('Zen Kaku Gothic New');
    expect(design.kanaScale).toBe(0.5);
    expect(design.grain).toBe(1);
    expect(design.colorScript.map((s) => s.start)).toEqual([0, 30]); // bad stop dropped, first stop moved to the window start
    expect(design.colorScript[1].duotone).toBe(1);
    expect(fixes.length).toBeGreaterThan(0);
  });
});

describe('colorAt', () => {
  const script = [
    { start: 0, shadow: '#000000', highlight: '#ffffff', accent: '#ff0000', duotone: 0 },
    { start: 10, shadow: '#000000', highlight: '#ffffff', accent: '#0000ff', duotone: 1 },
  ];
  it('holds a stop and blends into the next over a second', () => {
    expect(colorAt(script, 5).accent).toBe('#ff0000');
    expect(colorAt(script, 10.5).duotone).toBeCloseTo(0.5);
    expect(colorAt(script, 12).accent).toBe('#0000ff');
  });
});
