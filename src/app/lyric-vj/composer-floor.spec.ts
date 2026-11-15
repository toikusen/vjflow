// The composer seats a line only on a set that holds it at the type floor (lineplan-core seatMissed, render/type-floor.ts):
// long lines a world's column set at 49–74 px take another of its sets.
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { setWordSafe } from './phrases';
import type { SongTimeline } from './timeline';
import { leastOf, floorOf } from './render/type-floor';
import { blockOf, SET_SPECS } from './render/world-sets';

const wide = (x: string) => [...x].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 60 : 100), 0);
function song(texts: string[]): SongTimeline {
  const cues = texts.map((text, i) => ({ id: `c${i + 1}`, start: 3 + i * 4.5, end: 3 + i * 4.5 + 4.2, text, charStarts: [...text].map((_, k) => 3 + i * 4.5 + (4 * k) / [...text].length), charTimed: true }));
  const end = 3 + texts.length * 4.5 + 2;
  return { title: 'floor', duration: end, tempo: 128, beats: Array.from({ length: Math.ceil(end / 0.469) }, (_, i) => +(i * 0.469).toFixed(3)), downbeats: [], sections: [{ start: 0, end, type: 'chorus', energy: 0.8 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
}

describe('the composer and the type floor', () => {
  it('seats every world line on a set that holds it at the floor where the world has one (silk-cold, screentone, art-deco)', () => {
    const texts = ['ああしたいこうしたいが止まらないのに現実は…リアル', '私は何のために産まれたのかわからないけどまあいいや', '什麼兵器? 最喜歡雙截棍柔中帶剛', '教拳腳武術的老闆練鐵沙掌 耍楊家槍', '快使用雙截棍', '風生水起'];
    const s = song([...texts, ...texts]);
    for (const id of ['silk-cold', 'screentone', 'art-deco']) {
      const style = FREE_STYLES.find((x) => x.id === id)!;
      const sets = Object.keys(SET_SPECS).filter((k) => k.startsWith(`${id}/`));
      for (const seed of [0, 1]) {
        const { treatment } = freeJob(s, { style, seed });
        setWordSafe(true);
        try {
          for (const c of treatment.cues as unknown as { cueId: string; world?: { set: string } }[]) {
            const set = c.world?.set;
            if (!set) continue;
            const text = s.cues.find((x) => x.id === c.cueId)!.text.replace(/[\s　]+/g, ' ').trim();
            const holds = (k: string) => { const b = blockOf(text, SET_SPECS[k], wide); return !b.floorMiss && !b.bandMiss; };
            // (a line no set of the world holds is the only one left on a set that does not)
            if (sets.some(holds)) expect(holds(set), `${id} ${seed} ${set} ${text}`).toBe(true);
            if (holds(set)) expect(leastOf(blockOf(text, SET_SPECS[set], wide)), `${id} ${set}`).toBeGreaterThanOrEqual(floorOf(SET_SPECS[set]) - 0.5);
          }
        } finally {
          setWordSafe(false);
        }
      }
    }
  }, 60000);
});
