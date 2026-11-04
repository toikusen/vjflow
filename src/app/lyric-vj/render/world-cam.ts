// A world's one camera move into a new part (world-shared.ts camera; 2026-11-04 gap 5: the camera only drifted). Shared
// by the ground (kinetic.ts) and the words of the part's first line (world-layout.ts), so the camera moves the whole
// frame, not the ground alone. Rebuilt from Motion Prompt #176 (fly-through) by description only.
const [W, H] = [1920, 1080];
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const WORLD_CAM_SEC: Record<string, number> = { 'push-through': 0.5, diagonal: 0.42 };

/**
 * The move at `age` s into the part's first cut, about the frame's centre (px, y up, radians): out of a push through
 * the frame before (the new frame comes up from very close), or in on a diagonal (it swings in from a corner, scaled
 * so its edge never shows). Undefined once it has landed or for any other camera.
 */
export function worldCam(cam: string | undefined, age: number, dir: number): { dx: number; dy: number; s: number; r: number } | undefined {
  const sec = cam ? WORLD_CAM_SEC[cam] : undefined;
  if (!sec || age < 0 || age >= sec) return undefined;
  const k = 1 - ease(age / sec);
  return cam === 'push-through' ? { dx: 0, dy: 0, s: 1 + 0.9 * k, r: 0 } : { dx: dir * W * 0.12 * k, dy: H * 0.12 * k, s: 1 + 0.32 * k, r: dir * 0.04 * k };
}
