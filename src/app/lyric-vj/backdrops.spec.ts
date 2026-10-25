import { harvestBackdrops, legiblePair, tone } from './backdrops';

describe('harvestBackdrops', () => {
  const sections = [
    { layers: [{ kind: 'paper', color: '#F5EFE4' }, { kind: 'photo', asset: 'img' }, { kind: 'shapes', type: 'circle', size: 260, count: 4, color: '#1E64B4', ghosts: [{ dx: 3, dy: 2, color: '#FF4FAE' }] }] },
    { layers: [{ kind: 'paper', color: '#F5EFE4' }, { kind: 'shapes', type: 'circle', size: 260, count: 4, color: '#1E64B4', ghosts: [{ dx: 3, dy: 2, color: '#FF4FAE' }] }] }, // the first without its photo
    { layers: [{ kind: 'paper', color: '#f5efe4' }, { kind: 'frame', type: 'ticket', label: 'NONFIC LIVE', color: '#1E64B4' }, { kind: 'stamp', text: '推' }] },
  ];
  const out = harvestBackdrops(sections, ['#1E64B4', '#F5EFE4', '#FF4FAE'], ['#111111', '#EEEEEE', '#DD3322']);

  it('drops pictures and words, one preset per look', () => {
    expect(out.map((b) => b.id)).toEqual(['B1', 'B3']);
    expect(out.flatMap((b) => b.layers.map((l) => l.kind))).toEqual(['paper', 'shapes', 'paper', 'frame']);
    expect(out[1].layers[1]['label']).toBeUndefined();
    expect(out[0].what).toContain('大圓×4');
  });

  it('recolours into the song, nested ghosts too', () => {
    expect(out[0].layers[0]['color']).toBe('#EEEEEE');
    expect(out[1].layers[0]['color']).toBe('#EEEEEE');
    expect((out[0].layers[1]['ghosts'] as { color: string }[])[0].color).toBe('#DD3322');
  });
});

describe('legiblePair', () => {
  it('swaps a second ink too close to the first for the most legible candidate', () => {
    expect(legiblePair('#0E1430', '#3A3F6E', ['#F2672E', '#EDE4D3'])).toEqual(['#0E1430', '#EDE4D3']);
    expect(legiblePair('#1E64B4', '#F5EFE4', ['#000000'])).toEqual(['#1E64B4', '#F5EFE4']);
  });

  it('drops what the signature added except its bands', () => {
    const out = harvestBackdrops([{ layers: [{ kind: 'bands', colors: ['#111111'], sig: 'added' }, { kind: 'blob', color: '#222222', sig: 'added' }, { kind: 'blob', color: '#333333' }] }], [], []);
    expect(out[0].layers.map((l) => [l.kind, l['color']])).toEqual([['bands', undefined], ['blob', '#333333']]);
    expect(out[0].layers.some((l) => 'sig' in l)).toBe(false);
  });
});

describe('backdrop presets that look different', () => {
  const sky = (colors: string[]) => ({ layers: [{ kind: 'paper', color: '#EDE4D3' }, { kind: 'bands', colors, from: 0, to: 0.7 }] });
  it('keeps two skies alike in kind but not in colour, and says which is which', () => {
    const out = harvestBackdrops([sky(['#1B1530', '#3A1F45', '#E8A15A']), sky(['#2A0F1E', '#B0402E', '#FFD08A'])], [], []);
    expect(out.length).toBe(2);
    expect(out[0].what).not.toBe(out[1].what);
    expect(out[0].what).toContain('紫');
  });
  it('names colours by darkness and hue', () => {
    expect(tone('#0E1430')).toBe('深藍');
    expect(tone('#F2672E')).toBe('橘');
    expect(tone('#FFF1C2')).toBe('淺金');
  });
});

describe('backdrop specks', () => {
  it('leaves out a disc too small to read as anything', () => {
    const out = harvestBackdrops([{ layers: [{ kind: 'paper', color: '#EDE4D3' }, { kind: 'blob', r: 0.02, color: '#F2672E' }, { kind: 'blob', r: 0.3, color: '#F2672E' }] }], [], []);
    expect(out[0].layers.map((l) => l['r'] ?? l.kind)).toEqual(['paper', 0.3]);
  });

  it('carries a code layer only from the song\'s own treatment', async () => {
    const { harvestBackdrops } = await import('./backdrops');
    const sec = [{ layers: [{ kind: 'paper', color: '#EDE4D3' }, { kind: 'code', src: 'x' }] }];
    expect(harvestBackdrops(sec, [], [])[0].layers.map((l) => l.kind)).toEqual(['paper']);
    expect(harvestBackdrops(sec, [], [], new Set(['code']))[0].layers.map((l) => l.kind)).toEqual(['paper', 'code']);
  });

  it('keeps a stock disc or city skyline on two backdrops of a song, one when recent songs leaned on it', async () => {
    const { capMotifs } = await import('./backdrops');
    const b = (id: string, ...kinds: Record<string, unknown>[]) => ({ id, what: '', layers: [{ kind: 'paper' }, ...kinds] as never });
    const sun = { kind: 'blob', r: 0.2 }, city = { kind: 'skyline', type: 'city' };
    const out = capMotifs([b('B1', sun, city), b('B2', sun, city), b('B3', sun, city)]);
    expect(out.map((x) => x.layers.some((l) => l.kind === 'blob'))).toEqual([true, true, false]);
    expect(out[2].layers.find((l) => l.kind === 'skyline')!['type']).toBe('hills');
    const worn = capMotifs([b('B1', sun), b('B2', sun)], new Set(['circle']));
    expect(worn.map((x) => x.layers.length)).toEqual([2, 1]);
  });
});

