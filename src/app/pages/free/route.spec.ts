import { describe, expect, it } from 'vitest';
import { pageFor } from '../beta/route';

describe('/free', () => {
  it('is a notice, never the home page, unless the build asks for it', () => {
    expect(pageFor('/free')).toBe('free-off');
    expect(pageFor('/free/', { free: false })).toBe('free-off');
    expect(pageFor('/free', { free: true })).toBe('free');
  });
  it('does not claim paths that only start with its letters', () => {
    expect(pageFor('/freedom')).toBe('home');
    expect(pageFor('/free-data/songs', { free: true })).toBe('home');
  });
  it('leaves other pages alone', () => {
    expect(pageFor('/my', { free: true })).toBe('beta');
    expect(pageFor('/', { free: true })).toBe('home');
  });
});
