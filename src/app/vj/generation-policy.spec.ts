import { openAccessPolicy, resolveRange } from './generation-policy';

describe('resolveRange', () => {
  it('limits preview to 60s and full to the whole track', () => {
    expect(resolveRange('preview', 230)).toEqual({ start: 0, end: 60 });
    expect(resolveRange('preview', 40)).toEqual({ start: 0, end: 40 });
    expect(resolveRange('preview', 230, 100)).toEqual({ start: 100, end: 160 });
    expect(resolveRange('full', 230)).toEqual({ start: 0, end: 230 });
  });

  it('open access quotes everything as free and unlocked', async () => {
    const q = openAccessPolicy.quote('full', 230);
    expect(q).toEqual({ mode: 'full', range: { start: 0, end: 230 }, seconds: 230, credits: 0, locked: false });
    expect(await openAccessPolicy.authorize(q)).toBe(true);
  });
});
