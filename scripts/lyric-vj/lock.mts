// A lock file for one render at a time (per output directory, per job status), safe between processes:
// - taking it is one link() of a file that already holds our pid, so nobody ever reads an empty lock;
// - a lock left by a dead process is taken over only while holding `<lock>.takeover` (also made by link()), after
//   checking again that the lock still names that dead pid, so two takers never delete each other's new lock;
// - release removes the lock only while it still names us.
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const alive = (pid: number) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const holder = (file: string): number | undefined => {
  try {
    return Number(readFileSync(file, 'utf8')) || undefined;
  } catch {
    return undefined; // gone between the failed link and the read
  }
};

/** Makes `file` by hard-linking a temp file that already holds our pid: false when it exists. */
function linkWithPid(file: string): boolean {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, String(process.pid));
  try {
    linkSync(tmp, file);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    return false;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Removes `file` only if it still names `pid` (safe: nobody can create it while it exists). */
const removeIfHeldBy = (file: string, pid: number) => {
  if (holder(file) === pid) rmSync(file, { force: true });
};

/**
 * Takes the lock at `file` or throws `busy(pid)`'s message when a live process holds it. Returns release (also run on
 * exit and on SIGINT / SIGTERM).
 */
export function lockFile(file: string, busy: (pid: number) => string): () => void {
  mkdirSync(dirname(file), { recursive: true });
  const guard = `${file}.takeover`;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (linkWithPid(file)) return holdUntilExit(file);
    const pid = holder(file);
    if (pid === undefined) continue; // released meanwhile: try again
    if (alive(pid)) throw new Error(busy(pid));
    // stale: one taker at a time; the lock is checked again under the guard (it cannot change while it exists)
    if (!linkWithPid(guard)) {
      const g = holder(guard);
      if (g !== undefined && !alive(g)) throw new Error(`${guard} 是已結束的程序留下的，請確認沒有渲染在跑之後刪掉它`);
      continue; // another process is taking it over: see who ends up with it
    }
    try {
      if (holder(file) === pid) rmSync(file, { force: true });
    } finally {
      removeIfHeldBy(guard, process.pid);
    }
  }
  throw new Error(`拿不到 ${file}`);
}

function holdUntilExit(file: string): () => void {
  let held = true;
  const release = () => {
    if (held) removeIfHeldBy(file, process.pid);
    held = false;
  };
  const onSignal = (signal: NodeJS.Signals) => {
    release();
    process.kill(process.pid, signal);
  };
  process.on('exit', release);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return release;
}
