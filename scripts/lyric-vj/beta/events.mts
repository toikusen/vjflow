// A song's event log: one JSON line per thing that happened to it (upload, timing save, each job's start, phase, cost, end).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { songDir } from './store.mts';

export type BetaEvent = { at: string; type: string; jobId?: string; by?: string; [k: string]: unknown };

/** Appends one event to `songs/<songId>/events.jsonl`. */
export function logEvent(root: string, songId: string, e: Omit<BetaEvent, 'at'>, now: () => string = () => new Date().toISOString()) {
  const dir = songDir(root, songId);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ at: now(), ...e }) + '\n');
}

/** A song's events in the order they happened; lines that do not parse are skipped. */
export function readEvents(root: string, songId: string): BetaEvent[] {
  const file = join(songDir(root, songId), 'events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').flatMap((l) => {
    try { return l.trim() ? [JSON.parse(l) as BetaEvent] : []; } catch { return []; }
  });
}
