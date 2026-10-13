import { continuityProblems, parseTrack, TrackFrame } from './continuity';

const f = (t: number, shot: number, boxes: string) => parseTrack(`code layer: track ${t} ${shot} ${boxes}`)[0];

describe('prop continuity', () => {
  it('parses the renderer log', () => {
    const [x] = parseTrack('noise\ncode layer: track 1.500 3 cat:10,20,100,80,1.00;bird:0,0,50,50,0.40');
    expect(x).toEqual({ t: 1.5, shot: 3, boxes: [{ id: 'cat', x: 10, y: 20, w: 100, h: 80, a: 1 }, { id: 'bird', x: 0, y: 0, w: 50, h: 50, a: 0.4 }] });
  });

  it('finds jumps, pops and overlaps inside a shot, and lets cuts change anything', () => {
    const frames: TrackFrame[] = [f(1, 0, 'cat:0,0,100,100,1'), f(1 + 1 / 30, 0, 'cat:400,0,100,100,1;bird:420,20,100,100,1'), f(5, 1, 'cat:0,0,100,100,1'), f(5 + 1 / 30, 2, 'dog:900,900,90,90,1')];
    const p = continuityProblems(frames).join('\n');
    expect(p).toMatch(/cat.*瞬移/);
    expect(p).toMatch(/bird.*突然出現/);
    expect(p).toMatch(/cat 和 bird.*疊在一起|bird 和 cat.*疊在一起/);
    expect(p).not.toMatch(/dog/);
  });

  it('accepts a prop that fades in and one that travels', () => {
    const frames = [f(1, 0, ''), f(1 + 1 / 30, 0, 'cat:0,0,100,100,0.1'), ...[0, 1, 2, 3, 4, 5].map((k) => f(2 + k * 0.25, 0, `boat:${k * 40},0,100,60,1`))];
    expect(continuityProblems(frames)).toEqual([]);
  });

  it('flags bobbing in place', () => {
    const frames = [0, 1, 2, 3, 4, 5].map((k) => f(2 + k * 0.25, 4, `glass:${100 + (k % 2 ? 20 : 0)},100,80,80,1`));
    expect(continuityProblems(frames).join()).toMatch(/glass 在鏡頭 4 原地來回晃動/);
  });
});
