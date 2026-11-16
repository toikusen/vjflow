// A keyline's reach as a solid disc: where to stamp a letter's picture so its union is the letter grown by R px with no
// scallops. Rings of stamps from the rim inward, each ring's stamps no further apart than `gap` px along it, so a stroke
// thinner than the old twelve-stamp ring's 0.52 R spacing (a mincho hairline) is still covered all the way round. Pure.

/** Stamp offsets (px) filling the disc of radius R: rings at R, R - gap, … down to the centre, `gap` px apart along each. */
export function discOffsets(R: number, gap = 3): [number, number][] {
  if (R <= 0) return [[0, 0]];
  const out: [number, number][] = [[0, 0]];
  for (let r = R; r > gap / 2; r -= gap) {
    const n = Math.max(6, Math.ceil((2 * Math.PI * r) / gap));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  return out;
}
