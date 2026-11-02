// A line's own camera: the lyric itself is carried through its time on screen, apart from the background's camera.
// Never larger than the fitted size: push and pull travel below it, and slide and rise stay inside the fit's 48 px margin.

import type { CameraRig } from './camera-rig';

export type TextCamKind = 'push' | 'pull' | 'slide' | 'rise' | 'tilt' | 'lean-settle';
export interface TextCam { kind: TextCamKind; /** 1 or -1: which way it slides, rises or tilts. */ dir?: number; /** 0.5 gentle … 1.5 strong. */ amount?: number; /** A camera shared with the backdrop: replaces kind's own move (camera-rig.ts). */ rig?: CameraRig }
export const TEXT_CAM_KINDS: TextCamKind[] = ['push', 'pull', 'slide', 'rise', 'tilt'];
/** The share of a line's time its lean sways for, at either end: all of it outside the reading. */
const LEAN_END = 0.07;

/** The offset from the line's rest pose at e (0 → 1 through the line), as x, y in px, scale and rotation in radians. */
export function textCamAt(cam: TextCam, e: number) {
  const a = Math.min(1.5, Math.max(0, cam.amount ?? 1));
  const d = cam.dir ?? 1;
  const m = 2 * e - 1;
  return {
    x: cam.kind === 'slide' ? 24 * a * d * m : 0,
    y: cam.kind === 'rise' ? 16 * a * d * m : 0,
    scale: cam.kind === 'push' ? 1 - 0.07 * a * (1 - e) : cam.kind === 'pull' ? 1 - 0.07 * a * e : 1,
    // lean-settle holds one fixed angle; amount is that angle over 0.03, so the sway at each end dies away unevenly
    rot: cam.kind === 'tilt' ? 0.018 * a * d * m : cam.kind === 'lean-settle' ? 0.03 * a * d * (1 + 1.5 * Math.max(0, 1 - e / LEAN_END) ** 2.6 + 0.9 * Math.max(0, 1 - (1 - e) / LEAN_END) ** 1.7) : 0,
  };
}
