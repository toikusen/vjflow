// Custom scenes: for a song's key moments the director model writes its own procedural background (Three.js code)
// instead of picking a template over an AI picture. The code runs in its own scene, is drawn into a render target
// and takes the plate's place, so lyrics, motif and post effects stay on top exactly as elsewhere.
import * as THREE from 'three';

export interface CustomSceneSpec {
  id: string;
  start: number;
  end: number;
  /** Body of `function (THREE, api) { ...; return { group, update(t, s) } }`. */
  code: string;
  /** What the scene shows, for review notes. */
  description?: string;
}

/** What the scene code gets: frame size, the section's colours, the song's beats and a deterministic hash. */
export interface SceneApi {
  W: number;
  H: number;
  start: number;
  end: number;
  palette: { shadow: string; highlight: string; accent: string };
  beats: number[];
  /** Kick strength 0..1 per beat (same index as beats). */
  beatStrength: number[];
  hash: (a: number, b?: number) => number;
}

/** Per-frame musical state handed to update(). */
export interface SceneState {
  /** Seconds since the scene started, and 0..1 through it. */
  since: number;
  progress: number;
  /** Index of the last beat at or before t (-1 before the first), 0..1 phase to the next beat, decaying hit. */
  beat: number;
  phase: number;
  pulse: number;
  /** Kick strength of the last beat (0..1). */
  kick: number;
}

export interface SceneInstance {
  group: THREE.Object3D;
  update(t: number, s: SceneState): void;
}

export class CustomScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly inst: SceneInstance;

  constructor(readonly spec: CustomSceneSpec, private readonly api: SceneApi) {
    this.camera = new THREE.OrthographicCamera(-api.W / 2, api.W / 2, api.H / 2, -api.H / 2, -2000, 2000);
    this.camera.position.z = 10;
    // the code is our own director's output, rendered offline in a headless page
    const make = new Function('THREE', 'api', spec.code) as (three: typeof THREE, api: SceneApi) => SceneInstance;
    this.inst = make(THREE, api);
    this.scene.add(this.inst.group);
  }

  covers(t: number) {
    return t >= this.spec.start && t < this.spec.end;
  }

  update(t: number) {
    this.inst.update(t, sceneState(t, this.spec, this.api));
  }
}

/** Musical state at t for a scene (pure: also used by the generator's node-side smoke test). */
export function sceneState(t: number, spec: Pick<CustomSceneSpec, 'start' | 'end'>, api: Pick<SceneApi, 'beats' | 'beatStrength'>): SceneState {
  let lo = 0;
  let hi = api.beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (api.beats[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  const beat = lo - 1;
  const last = api.beats[beat] ?? -10;
  const next = api.beats[beat + 1] ?? last + 0.5;
  return {
    since: t - spec.start,
    progress: Math.min(1, Math.max(0, (t - spec.start) / Math.max(0.1, spec.end - spec.start))),
    beat,
    phase: Math.min(1, Math.max(0, (t - last) / Math.max(0.05, next - last))),
    pulse: Math.exp(-(t - last) * 7),
    kick: api.beatStrength[beat] ?? 0.5,
  };
}
