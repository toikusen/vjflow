import { Injectable } from '@angular/core';
import { autoDetectRenderer, Color, ColorMatrixFilter, Container, Renderer } from 'pixi.js';
import { beatIndexAt, emptyFrame, getFeaturesAt, onsetStrengthAt } from '../../audio/audio-features';
import { effectiveHitThreshold, Look } from '../look';
import { createRng, hashString } from '../seeded-random';
import { VJ_STYLES } from '../styles';
import { VJStyle } from '../styles/vj-style.interface';
import { TransitionType, VJProject, VJScene } from '../vj-project.model';
import { TransitionEffect } from './effects/transition.effect';
import { CENTER_X, CENTER_Y, clamp01, createFrameContext, Envelope, STAGE_HEIGHT, STAGE_WIDTH } from './frame-context';
import { CompositeLayer } from './composite.layer';
import { LyricLayer } from './layers/lyric.layer';
import { VjLayer } from './layers/vj-layer';
import { createVjTextures, destroyVjTextures, VjTextures } from './textures';

/** A jump larger than this between frames is treated as a seek (state reset, no transition). */
const SEEK_THRESHOLD = 0.3;
const MAX_FRAME_DT = 0.1;

export class RendererInitError extends Error {
  constructor(cause: unknown) {
    super('無法啟動 WebGL 繪圖引擎，請開啟瀏覽器的硬體加速或改用其他瀏覽器。', { cause });
    this.name = 'RendererInitError';
  }
}

export interface RendererStats {
  fps: number;
  time: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  scene: string;
}

interface ActiveScene {
  index: number;
  scene: VJScene;
  layer: VjLayer;
  slot: Container;
  colors: number[];
}

/**
 * Renders a VJProject at a fixed 1920×1080 internal resolution.
 * The picture is a function of the current time: when a clock is attached (the audio element),
 * every frame reads it, so seeking audio immediately moves the visuals too.
 * Provided per preview component (one renderer per canvas).
 */
@Injectable()
export class VjRendererService {
  readonly stats: RendererStats = { fps: 0, time: 0, energy: 0, bass: 0, mid: 0, treble: 0, scene: '' };

  private renderer?: Renderer;
  private textures?: VjTextures;
  private readonly stage = new Container();
  private readonly sceneRoot = new Container();
  private readonly transition = new TransitionEffect();
  private lyricLayer?: LyricLayer;
  private project?: VJProject;
  private style?: VJStyle;
  private hitThreshold = 1;
  private current: ActiveScene | null = null;
  private previous: ActiveScene | null = null;
  private clock?: () => number;

  private time = 0;
  private playing = false;
  private dirty = true;
  private rafId = 0;
  private lastWall = 0;
  private fpsFrames = 0;
  private fpsSince = 0;
  private lastBeat = -1;

  private readonly ctx = createFrameContext();
  private readonly features = emptyFrame();
  private env = this.createEnvelopes(0.05, 0.25);

  get canvas(): HTMLCanvasElement | undefined {
    return this.renderer?.canvas;
  }

  get currentTime(): number {
    return this.time;
  }

  async initialize(host: HTMLElement): Promise<void> {
    try {
      this.renderer = await autoDetectRenderer({
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        preference: 'webgl',
        antialias: true,
        background: '#000000',
        resolution: 1,
      });
      this.textures = createVjTextures();
    } catch (err) {
      throw new RendererInitError(err);
    }
    const canvas = this.renderer.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    this.stage.addChild(this.sceneRoot, this.transition.overlay);
    this.lastWall = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  loadProject(project: VJProject): void {
    this.project = project;
    this.style = VJ_STYLES[project.styleId];
    const m = this.style.mapping;
    this.env = this.createEnvelopes(m.attack, m.decay);
    this.hitThreshold = effectiveHitThreshold(this.style, project.look);
    this.applyGrade(project.look.grade);
    this.lyricLayer?.destroy();
    this.lyricLayer = project.lyrics?.length ? new LyricLayer(project.lyrics, project.lyricPreset, this.style.typography) : undefined;
    if (this.lyricLayer) this.stage.addChild(this.lyricLayer.view);
    this.seek(Math.min(Math.max(this.time, project.range.start), project.range.end));
  }

  /** Attach the authoritative playback clock (e.g. audio.currentTime). */
  setClock(clock: (() => number) | undefined): void {
    this.clock = clock;
  }

  play(): void {
    this.playing = true;
    this.lastWall = performance.now();
  }

  pause(): void {
    this.playing = false;
    this.dirty = true;
  }

  /** Hard jump: resets smoothing/particles and shows the scene at `time` with no transition. */
  seek(time: number): void {
    this.time = this.clampTime(time);
    this.resetState();
    this.dirty = true;
  }

  /** Soft time update for continuous playback; large jumps are promoted to seek(). */
  setTime(time: number): void {
    if (Math.abs(time - this.time) > SEEK_THRESHOLD) return this.seek(time);
    this.time = this.clampTime(time);
    this.dirty = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.disposeScenes();
    this.lyricLayer?.destroy();
    this.stage.destroy({ children: true });
    if (this.textures) destroyVjTextures(this.textures);
    this.renderer?.canvas.remove();
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  private readonly loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const wallDt = Math.min(MAX_FRAME_DT, (now - this.lastWall) / 1000);
    this.lastWall = now;
    this.trackFps(now);
    if (!this.renderer || !this.project) return;

    let dt = 0;
    if (this.playing) {
      const prev = this.time;
      if (this.clock) this.setTime(this.clock());
      else this.time = this.clampTime(this.time + wallDt);
      dt = Math.min(MAX_FRAME_DT, Math.max(0, this.time - prev));
      if (this.current === null) dt = 0;
    }
    if (!this.playing && !this.dirty) return;
    this.updateFrame(dt);
    this.renderer.render(this.stage);
    this.dirty = false;
  };

  private updateFrame(dt: number): void {
    const project = this.project!;
    const style = this.style!;
    const { analysis, scenes } = project;
    const t = this.time;
    const ctx = this.ctx;

    getFeaturesAt(analysis, t, this.features);
    ctx.time = t;
    ctx.dt = dt;
    ctx.energy = this.env.energy.update(this.features.energy, dt);
    ctx.bass = this.env.bass.update(this.features.bass, dt);
    ctx.mid = this.env.mid.update(this.features.mid, dt);
    ctx.treble = this.env.treble.update(this.features.treble, dt);

    const bi = beatIndexAt(analysis.beats, t);
    ctx.beat = dt > 0 && bi > this.lastBeat;
    const strength = ctx.beat ? onsetStrengthAt(analysis, analysis.beats[bi]) : 0;
    ctx.hit = strength >= this.hitThreshold ? strength : 0;
    ctx.beatIndex = bi;
    ctx.beatPulse = bi >= 0 ? Math.exp(-(t - analysis.beats[bi]) / style.mapping.beatDecay) : 0;
    this.lastBeat = bi;

    const idx = this.sceneIndexAt(scenes, t);
    if (!this.current || idx !== this.current.index) {
      this.enterScene(idx, !!this.current && idx === this.current.index + 1 && dt > 0);
    }
    const current = this.current!;
    if (this.previous) {
      const duration = Number(current.scene.parameters['transitionDuration'] ?? 0.5);
      const p = (t - current.scene.start) / Math.max(0.01, duration);
      if (p >= 1 || p < 0) this.endTransition();
      else this.transition.apply(current.scene.parameters['transition'] as TransitionType, p, this.previous.slot, current.slot, current.colors);
    }

    if (this.previous) this.updateLayer(this.previous);
    this.updateLayer(current);
    this.lyricLayer?.update(ctx, current.colors);

    const s = this.stats;
    s.time = t;
    s.energy = ctx.energy;
    s.bass = ctx.bass;
    s.mid = ctx.mid;
    s.treble = ctx.treble;
    s.scene = `${idx + 1}/${scenes.length} ${current.scene.preset} (${current.scene.parameters['tier']}, target ${Number(current.scene.parameters['target']).toFixed(2)})`;
  }

  /** Grades scenes only: the transition overlay and lyrics sit on `stage` and keep their colors. */
  private applyGrade({ saturation, contrast, brightness }: Look['grade']): void {
    if (!saturation && !contrast && !brightness) {
      this.sceneRoot.filters = [];
      return;
    }
    const grade = new ColorMatrixFilter();
    grade.saturate(saturation, false);
    grade.contrast(contrast, true);
    grade.brightness(1 + brightness, true);
    this.sceneRoot.filters = [grade];
  }

  private updateLayer(a: ActiveScene): void {
    const ctx = this.ctx;
    ctx.sceneTime = ctx.time - a.scene.start;
    ctx.sceneProgress = clamp01(ctx.sceneTime / Math.max(0.01, a.scene.end - a.scene.start));
    ctx.intensity = a.scene.intensity;
    a.layer.update(ctx);
  }

  private enterScene(index: number, withTransition: boolean): void {
    if (withTransition) {
      if (this.previous) this.disposeScene(this.previous);
      this.previous = this.current;
    } else {
      this.disposeScenes();
    }
    this.current = this.createScene(index);
    this.sceneRoot.addChild(this.current.slot);
  }

  private endTransition(): void {
    if (this.previous) this.disposeScene(this.previous);
    this.previous = null;
    if (this.current) this.transition.reset(this.current.slot);
  }

  private createScene(index: number): ActiveScene {
    const project = this.project!;
    const scene = project.scenes[index];
    const deps = { scene, style: this.style!, textures: this.textures!, rng: createRng(hashString(scene.id) ^ project.seed), renderer: this.renderer };
    const layer = new CompositeLayer(deps);
    const slot = new Container();
    slot.pivot.set(CENTER_X, CENTER_Y);
    slot.position.set(CENTER_X, CENTER_Y);
    slot.addChild(layer.view);
    return { index, scene, layer, slot, colors: scene.palette.map((c) => new Color(c).toNumber()) };
  }

  private disposeScene(a: ActiveScene): void {
    a.slot.mask = null;
    a.layer.destroy();
    a.slot.destroy();
  }

  private disposeScenes(): void {
    if (this.previous) this.disposeScene(this.previous);
    if (this.current) this.disposeScene(this.current);
    this.previous = this.current = null;
    this.transition.reset();
  }

  private resetState(): void {
    this.disposeScenes();
    this.lyricLayer?.reset();
    if (!this.project) return;
    const f = getFeaturesAt(this.project.analysis, this.time, this.features);
    this.env.energy.reset(f.energy);
    this.env.bass.reset(f.bass);
    this.env.mid.reset(f.mid);
    this.env.treble.reset(f.treble);
    this.lastBeat = beatIndexAt(this.project.analysis.beats, this.time);
  }

  private sceneIndexAt(scenes: VJScene[], t: number): number {
    for (let i = 0; i < scenes.length; i++) if (t < scenes[i].end) return i;
    return scenes.length - 1;
  }

  private clampTime(t: number): number {
    return Math.min(Math.max(0, t), this.project?.duration ?? t);
  }

  private createEnvelopes(attack: number, decay: number) {
    return {
      energy: new Envelope(attack, decay),
      bass: new Envelope(attack, decay),
      mid: new Envelope(attack * 1.5, decay),
      treble: new Envelope(attack, decay * 0.7),
    };
  }

  private trackFps(now: number): void {
    this.fpsFrames++;
    if (now - this.fpsSince >= 500) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince));
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
  }
}
