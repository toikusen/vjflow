// The delivery gate of a finished beta video: the objective faults that keep it from the person until the admin has
// looked (exit 10 = hold, as make.sh's other holds). It measures nothing new — it reads what the steps already wrote
// (render.mts metrics.json, typeplan.mts plan-check.json) and probes the file — so a fault found here is one the
// pipeline knew about and used to hand over anyway. A missing, broken or older record is a finding too, never a pass,
// and a finding is the only outcome: the gate itself never fails a job (that would strand a paid video in `failed`).
//
// npx tsx scripts/lyric-vj/beta/quality.mts --video <mp4> --metrics <metrics.json> --expected-sec <s> [--plan-check <plan-check.json>] [--fps 30] [--report <quality.json>]
// prints one `quality: <finding>` line each (or `quality: ok`); --report writes { findings, fileOk } for the server's approve
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export interface Probe { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; duration: number }
export interface Report {
  findings: string[];
  /** False when the file itself cannot be handed over (unparsable, no video or audio stream): approve refuses it. */
  fileOk: boolean;
  /** True when a fresh render may mend it (a renderer fault, an undeliverable file): make.sh renders once more instead of holding. */
  rerender: boolean;
  /** Lines under the reading-time rule that every renderer fix was already applied to and that miss by under 0.5 s: on record, not a hold. */
  notes: string[];
}
/** A line that readFix already landed at once (read-cut) and that misses by less than this is as readable as the renderer can make it. */
const READ_SLACK = 0.5;

/** The file's streams and length by ffprobe, or 'unreadable' when it cannot be parsed. */
export function probe(video: string): Probe | 'unreadable' {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', video], { encoding: 'utf8' });
  if (r.status !== 0) return 'unreadable';
  try {
    const j = JSON.parse(r.stdout) as { streams?: Probe['streams']; format?: { duration?: string } };
    const duration = Number(j.format?.duration);
    return Array.isArray(j.streams) && j.streams.length && Number.isFinite(duration) ? { streams: j.streams, duration } : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

const list = (xs: string[], max = 4) => xs.slice(0, max).join('、') + (xs.length > max ? `…共 ${xs.length} 筆` : '');
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown): string[] | undefined => (Array.isArray(x) && x.every((s) => typeof s === 'string') ? x : undefined);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/**
 * The lines of metrics.json that read too short, or a format finding; undefined fields are findings, never passes. A
 * line readFix already landed at once (adjust has read-cut) and that misses by under READ_SLACK is a note: the renderer
 * has nothing left to give it, and the measure counts settled time, not when the line started to read.
 */
function readableFindings(m: Record<string, unknown>): { findings: string[]; notes: string[] } {
  const r = m['readable'];
  if (!isObj(r) || !Array.isArray(r['failing'])) return { findings: ['量測結果裡沒有可讀時間（readable.failing）'], notes: [] };
  const bad: string[] = [];
  const lines: string[] = [];
  const notes: string[] = [];
  for (const c of r['failing']) {
    const o = isObj(c) ? c : {};
    const [text, a, b] = [typeof o['text'] === 'string' ? o['text'] : undefined, num(o['readableSec']), num(o['requiredSec'])];
    if (text === undefined || a === undefined || b === undefined) { bad.push(JSON.stringify(c).slice(0, 60)); continue; }
    const line = `${text}（${a.toFixed(1)}/${b.toFixed(1)}s）`;
    const cut = Array.isArray(o['adjust']) && (o['adjust'] as unknown[]).includes('read-cut');
    (cut && b - a < READ_SLACK ? notes : lines).push(line);
  }
  const findings: string[] = [];
  if (lines.length) findings.push(`${lines.length} 句低於閱讀時間規則：${list(lines, 3)}`);
  if (bad.length) findings.push(`可讀時間紀錄格式錯誤：${list(bad, 2)}`);
  return { findings, notes: notes.map((x) => `已盡渲染器所能、仍短少不到 ${READ_SLACK} 秒：${x}`) };
}

/**
 * Every reason the video must wait for the admin, in words for the phase line, and whether the file itself can be
 * handed over; findings [] releases it. `metrics` and `planCheck` are the parsed files, or undefined when missing or
 * unparsable (a finding, except planCheck when `planRan` is false). Durations are compared with 0.5 s of slack: a
 * trimmed range ends on a frame and AAC adds priming — an initial tolerance, to tighten once finished files are measured.
 * Never throws: a shape it does not understand is a finding.
 */
export function releaseFindings(o: { metrics?: unknown; planCheck?: unknown; probe: Probe | 'unreadable'; expectedSec: number; fps?: number; planRan?: boolean }): Report {
  const out: string[] = [];
  const notes: string[] = [];
  let fileOk = true;
  let rerender = false;
  try {
    if (!isObj(o.metrics)) out.push('沒有量測結果（metrics.json 缺少或壞掉）');
    else {
      const r = readableFindings(o.metrics);
      out.push(...r.findings);
      notes.push(...r.notes);
      const errs = strings(o.metrics['rendererErrors']);
      if (!errs) out.push('量測結果沒有渲染器錯誤紀錄（舊版渲染，未驗證）');
      else if (errs.length) { out.push(`渲染器出錯 ${errs.length} 筆：${list(errs, 2)}`); rerender = true; }
    }
    if (o.planRan !== false) {
      const pc = o.planCheck;
      const [missing, shots, cues] = isObj(pc) ? [strings(pc['missing']), strings(pc['unknownShots']), strings(pc['unknownCues'])] : [];
      if (!missing || !shots || !cues) out.push('沒有企劃檢查結果（plan-check.json 缺少、壞掉或舊版）');
      else {
        if (missing.length) out.push(`企劃漏排了鏡頭 ${list(missing)}（前一段的背景會一直延續）`);
        if (shots.length || cues.length) out.push(`企劃指到不存在的鏡頭或歌詞：${list([...shots, ...cues])}`);
      }
    }
    if (o.probe === 'unreadable') { out.push('影片檔無法解析'); fileOk = false; rerender = true; }
    else {
      const v = o.probe.streams.find((s) => s.codec_type === 'video');
      if (!v) { out.push('影片檔沒有影像軌'); fileOk = false; rerender = true; }
      else {
        if (v.width !== 1920 || v.height !== 1080) out.push(`影像尺寸 ${v.width}×${v.height}，不是 1920×1080`);
        if (o.fps) {
          const [n, d] = (v.r_frame_rate ?? '').split('/').map(Number);
          if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n <= 0) out.push(`影格率無法判讀（${v.r_frame_rate ?? '無'}）`);
          else if (Math.abs(n / d - o.fps) > 0.01) out.push(`影格率 ${(n / d).toFixed(2)}，不是 ${o.fps}`);
        }
      }
      if (!o.probe.streams.some((s) => s.codec_type === 'audio')) { out.push('影片檔沒有聲音軌'); fileOk = false; rerender = true; }
      if (!Number.isFinite(o.expectedSec) || o.expectedSec <= 0) out.push(`歌長無法判讀（${o.expectedSec}）`);
      else if (Math.abs(o.probe.duration - o.expectedSec) > 0.5) out.push(`影片長 ${o.probe.duration.toFixed(2)}s，歌長 ${o.expectedSec.toFixed(2)}s`);
    }
  } catch (e) {
    out.push(`量測資料格式錯誤：${(e as Error).message}`);
  }
  return { findings: out, fileOk, rerender, notes };
}

const readJson = (f?: string) => { try { return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined; } catch { return undefined; } };

if (process.argv[1]?.endsWith('quality.mts')) {
  const usage = (): never => { console.error('usage: quality.mts --video <mp4> --metrics <metrics.json> --expected-sec <s> [--plan-check <json>] [--fps 30] [--report <json>]'); process.exit(2); };
  const a = (() => { try { return parseArgs({ options: { video: { type: 'string' }, metrics: { type: 'string' }, 'plan-check': { type: 'string' }, 'expected-sec': { type: 'string' }, fps: { type: 'string' }, report: { type: 'string' } } }).values; } catch { return usage(); } })();
  if (!a.video || !a.metrics || !a['expected-sec']) usage();
  const report = releaseFindings({ metrics: readJson(a.metrics), planCheck: readJson(a['plan-check']), planRan: a['plan-check'] !== undefined, probe: existsSync(a.video) ? probe(a.video) : 'unreadable', expectedSec: Number(a['expected-sec']), fps: a.fps ? Number(a.fps) : undefined });
  if (a.report) { try { writeFileSync(a.report, JSON.stringify(report, null, 1)); } catch (e) { console.error(`quality: report not written: ${(e as Error).message}`); } }
  for (const f of report.findings) console.log(`quality: ${f}`);
  for (const n of report.notes) console.log(`quality note: ${n}`);
  if (!report.findings.length) console.log('quality: ok');
  // 20 = a fresh render may mend it (make.sh renders once more, then fails the job: the person pays nothing)
  process.exit(report.rerender ? 20 : report.findings.length ? 10 : 0);
}
