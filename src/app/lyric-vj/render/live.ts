// The song playing in a browser tab: the offline engine on a canvas, driven by the audio element's clock. Nothing here
// draws: a dropped frame only means the next one lands where the music is.
import { LyricVjEngine, RenderJob } from './engine';
import { loadJobFonts } from './job-fonts';
import { clearTextCaches } from './text-fx';

export interface LiveStats { fps: number; p95: number; quality: number; lines: number; startMs: number }

/** Frames a window of the frame clock looks back over; frames judged, and how slow they must be, before a slow machine steps down. */
const WINDOW = 60;
const JUDGE = 20;
const STEP_DOWN_MS = 40;
const QUALITIES = [1, 0.75, 0.5];
/** How long a first frame waits for its faces, ms. A warm cache beats this, so only a first visit shows a stand-in. */
const FACE_BUDGET = 120;

/** Whether the last frames came too slowly to keep this quality (a full window of them, so one hitch does not count). */
export const tooSlow = (times: number[], quality: number) => { const last = times.slice(-JUDGE); return last.length >= JUDGE && quality < QUALITIES.length - 1 && last.reduce((s, v) => s + v, 0) / JUDGE >= STEP_DOWN_MS; };

/** A preview's picture on a canvas it owns: a new one per plan, since a WebGL context cannot be re-laid. */
export class LivePlayer {
  private engine?: LyricVjEngine;
  private canvas?: HTMLCanvasElement;
  private raf = 0;
  private times: number[] = [];
  private last = 0;
  private quality = 0;
  private startMs = 0;
  private turn = 0;
  /** Settles when the picture is in its real faces. An export waits for this; it rejects if they could not be fetched. */
  settled: Promise<void> = Promise.resolve();
  /** Set for a song with no audio: the clock runs from here. */
  private silent?: { at: number; t: number; playing: boolean };
  private job?: RenderJob;
  /** The moment shown while the song waits at its very start: the first line, being read. */
  poster?: number;
  onFrame?: (t: number) => void;

  constructor(private host: HTMLElement, readonly audio: HTMLAudioElement, private auto = true) {}

  /**
   * Puts a job on screen at the audio's time; the previous picture stays up until the new one has its first frame. A
   * song's faces can take seconds to download the first time, so a frame does not wait past FACE_BUDGET for them: it goes
   * up in what the page has, and the same job is built again once they are in (`settled`).
   */
  async load(job: RenderJob) {
    this.job = job;
    const turn = ++this.turn;
    const began = performance.now();
    const made = this.make(job);
    const faces = loadJobFonts(job).then(() => made.engine.loadFaces());
    const inTime = await Promise.race([faces.then(() => true, () => false), new Promise<boolean>((r) => setTimeout(r, FACE_BUDGET, false))]);
    await this.show(made, turn);
    this.startMs = performance.now() - began;
    this.settled = inTime ? Promise.resolve() : faces.then(() => this.rebuild(job, turn));
    this.settled.catch(() => undefined);
    return this.startMs;
  }

  private make(job: RenderJob) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 });
    return { canvas, engine: new LyricVjEngine(canvas, { ...job, live: true, facesLater: true }) };
  }

  /** The job again with its faces in: lines laid out and glyphs drawn in a stand-in face go with the caches. */
  private async rebuild(job: RenderJob, turn: number) {
    if (turn !== this.turn) return;
    this.stop();
    clearTextCaches();
    await this.show(this.make(job), turn);
  }

  private async show({ engine, canvas }: ReturnType<LivePlayer['make']>, turn: number) {
    await engine.init();
    await engine.renderAt(this.shownAt(this.time()));
    // a newer plan took over while this one was built
    if (turn !== this.turn) return engine.dispose(false);
    this.stop();
    this.engine?.dispose(false);
    this.canvas?.remove();
    this.host.append(canvas);
    [this.engine, this.canvas] = [engine, canvas];
    engine.setQuality(QUALITIES[this.quality]);
    engine.preview = true;
    this.start();
  }

  /** The engine and its canvas for an export: the preview's loop is stopped first. */
  hold() {
    this.stop();
    this.engine!.setQuality(1);
    this.engine!.preview = false;
    return { engine: this.engine!, canvas: this.canvas! };
  }

  /** A second engine on the job on screen that draws one layer only, for a layered export; the caller disposes it. */
  async layerEngine(layer: 'text' | 'back') {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 });
    const engine = new LyricVjEngine(canvas, { ...this.job!, live: true, layer });
    await engine.init();
    return { engine, canvas };
  }

  /** Back to the preview after an export. */
  resume() {
    this.engine!.setQuality(QUALITIES[this.quality]);
    this.engine!.preview = true;
    this.start();
  }

  /** What stands still at the top of a song not yet played: often an intro, a black frame with no words. */
  private shownAt(t: number) {
    return this.poster !== undefined && t === 0 && !this.playing ? this.poster : t;
  }

  time() {
    if (!this.silent) return this.audio.currentTime;
    return this.silent.t + (this.silent.playing ? (performance.now() - this.silent.at) / 1000 : 0);
  }

  /** A song with no audio file runs on the page's own clock. */
  setSilent(on: boolean) {
    if (on && this.silent) return; // a reroll keeps the song's place
    this.silent = on ? { at: performance.now(), t: 0, playing: false } : undefined;
  }

  play() {
    if (this.silent) this.silent = { at: performance.now(), t: this.silent.t, playing: true };
    else return this.audio.play();
    return Promise.resolve();
  }

  pause() {
    if (this.silent) this.silent = { at: performance.now(), t: this.time(), playing: false };
    else this.audio.pause();
  }

  get playing() {
    return this.silent ? this.silent.playing : !this.audio.paused;
  }

  seek(t: number) {
    if (this.silent) this.silent = { at: performance.now(), t, playing: this.silent.playing };
    else this.audio.currentTime = t;
  }

  /** What the current engine holds (checks). */
  memory() {
    return this.engine?.liveMemory();
  }

  stats(): LiveStats {
    const sorted = [...this.times].sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
    return { fps: mean ? 1000 / mean : 0, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, quality: QUALITIES[this.quality], lines: this.engine?.liveLines() ?? 0, startMs: this.startMs };
  }

  /** A machine that cannot keep up gets a smaller picture: the music does not wait, so a low frame rate is what it would see. */
  private adapt() {
    if (!this.auto || !tooSlow(this.times, this.quality)) return;
    this.quality += 1;
    this.engine?.setQuality(QUALITIES[this.quality]);
    this.times = [];
  }

  private start() {
    this.last = performance.now();
    const tick = async () => {
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      this.times.push(now - this.last);
      if (this.times.length > WINDOW) this.times.shift();
      this.last = now;
      if (this.playing) this.adapt();
      const t = this.time();
      await this.engine?.renderAt(this.shownAt(t));
      this.onFrame?.(t);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.turn++;
    this.stop();
    this.engine?.dispose();
    this.canvas?.remove();
    this.engine = this.canvas = undefined;
  }
}
