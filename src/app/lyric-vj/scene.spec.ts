import { describe, expect, it } from 'vitest';
import { checkScenes, contrastErrors, emWidth, enterSec, fits, ledBatches, momentCamera, posterPhrases, resolveTime, reusedSkeletons, Scene, sceneMotifs, SceneSong, shownTexts, wrapRows } from './scene';

const song: SceneSong = {
  beats: [10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14],
  downbeats: [10, 12, 14],
  cues: [
    { id: 'c1', start: 10, end: 12, text: 'スカしてんじゃねえ！（ねえ！）', charStarts: [10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.5, 11.5, 11.5, 11.5, 11.5], charTimed: true },
    { id: 'c2', start: 12, end: 13, text: '燃やせ！（あわ！）（絶対優勝！）' },
    { id: 'c3', start: 13, end: 16, text: '下剋上なvibes!' },
  ],
};
const scene = (parts: Scene['parts']): Scene => ({ id: 's1', start: 10, end: 16, intent: '台下接管舞台', parts });
const storm = () =>
  scene([
    { id: 'light', kind: 'stage', z: 0, events: [{ kind: 'flash', at: { edge: 'start' } }] },
    { id: 'wall', kind: 'led', z: 1, params: { mode: 'row' }, lines: [{ cueId: 'c1', role: 'call' }, { cueId: 'c2', role: 'call' }] },
    { id: 'band', kind: 'band', z: 2, params: { mode: 'stack' }, lines: [{ cueId: 'c1', role: 'lead' }, { cueId: 'c2', role: 'lead' }, { cueId: 'c3', role: 'lead' }] },
  ]);

describe('scenes', () => {
  it('resolves times on characters, line edges, beats and the scene, flagging unverified characters', () => {
    const s = storm();
    expect(resolveTime({ cue: 'c1', char: 10 }, s, song)).toEqual({ t: 11.5, uncertain: false });
    expect(resolveTime({ cue: 'c2', char: 4 }, s, song)!.uncertain).toBe(true);
    expect(resolveTime({ cue: 'c3', edge: 'end' }, s, song)!.t).toBe(16);
    expect(resolveTime({ beat: 3 }, s, song)!.t).toBe(11.5);
    expect(resolveTime({ downbeat: 1 }, s, song)!.t).toBe(12);
    expect(resolveTime({ edge: 'end' }, s, song)!.t).toBe(16);
    expect(resolveTime({ cue: 'c1', char: 99 }, s, song)).toBeUndefined();
  });

  it('lets several parts carry one scene, each its own lines', () => {
    const shown = shownTexts(storm(), song);
    expect(shown.filter((x) => x.partId === 'wall').map((x) => x.text)).toEqual(['ねえ！', 'あわ！', '絶対優勝！']);
    expect(shown.filter((x) => x.partId === 'band').map((x) => x.text)).toEqual(['スカしてんじゃねえ！', '燃やせ！', '下剋上なvibes!']);
    expect(checkScenes([storm()], song, new Set(['c1', 'c2', 'c3'])).errors).toEqual([]);
  });

  it('refuses what cannot be drawn instead of falling back to a caption', () => {
    const s = storm();
    s.parts.push({ id: 'x', kind: 'confetti' as never, z: 3 });
    s.parts[2].lines = s.parts[2].lines!.filter((l) => l.cueId !== 'c3');
    const { errors } = checkScenes([s], song, new Set(['c1', 'c2', 'c3']));
    expect(errors.join('\n')).toMatch(/沒有這個元件/);
    expect(errors.join('\n')).toMatch(/c3「下剋上なvibes!」在分鏡 s1 裡沒有元件承載/);
  });

  it('refuses a line shown too briefly and flags estimated timings', () => {
    // one text at a time: あわ！ is replaced by 絶対優勝！ 0.4 s later
    const s = storm();
    s.parts[1].params = { mode: 'one' };
    s.parts[2].params = { mode: 'one' };
    const r = checkScenes([s], song, new Set(['c1', 'c2', 'c3']));
    expect(r.errors.join('\n')).toMatch(/あわ！」在 wall 只停 0.3 秒/);
    // 燃やせ！ is up the second it is sung before the next line: all the song gives it, not a reading-time fault
    expect(r.errors.join('\n')).not.toMatch(/燃やせ！」在 band 只停/);
    expect(r.warnings.join('\n')).toMatch(/あわ！」的出現時間是估的/);
  });

  it('packs a burst of calls into batches that never shrink once up', () => {
    expect(emWidth('ねえ！')).toBe(3);
    expect(emWidth('Oh, yeah!')).toBeCloseTo(5.1);
    // three short calls fit one row; a long run spills to a second row, then to a new batch
    expect(ledBatches(['ねえ！', 'あわ！', '絶対優勝！'], 2)).toEqual([{ batch: 0, row: 0 }, { batch: 0, row: 0 }, { batch: 0, row: 0 }]);
    const many = ledBatches(Array.from({ length: 8 }, () => 'そーれっそーれっ'), 2);
    expect(many.map((x) => `${x.batch}.${x.row}`)).toEqual(['0.0', '0.0', '0.1', '0.1', '1.0', '1.0', '1.1', '1.1']);
    // every call of a batch is up from its own time to the batch's end: earlier ones are not replaced as later come
    const wall = shownTexts(storm(), song).filter((x) => x.partId === 'wall');
    expect(new Set(wall.map((x) => x.batch)).size).toBe(1);
    expect(wall[0].to).toBe(wall[2].to);
  });

  it('splits a poster line into phrases at spaces and sentence marks', () => {
    expect(posterPhrases('死にそうな 刹那 全開を')).toEqual([{ text: '死にそうな', start: 0 }, { text: '刹那', start: 6 }, { text: '全開を', start: 9 }]);
    // クソデカ感情！ is past a large row's six characters: broken at its word boundary
    expect(posterPhrases('商売繁盛！クソデカ感情！一生感動！').map((x) => x.text)).toEqual(['商売繁盛！', 'クソデカ', '感情！', '一生感動！']);
    expect(posterPhrases('え！？盛れてんじゃん！').map((x) => x.text)).toEqual(['え！？', '盛れてんじゃん！']);
    // too long for one large row: broken at the word boundary nearest the middle
    expect(posterPhrases('引きちぎり踊れ！')).toEqual([{ text: '引きちぎり', start: 0 }, { text: '踊れ！', start: 5 }]);
  });

  it('wraps at word boundaries and refuses what a part cannot hold instead of shrinking it', () => {
    expect(wrapRows('言ってるうちに剥がされてく', 14, 2)).toEqual(['言ってるうちに剥がされてく']);
    expect(wrapRows('とかなんとか言ってるうちに剥がされてく', 14, 2)).toEqual(['とかなんとか言ってるうちに', '剥がされてく']);
    expect(wrapRows('とかなんとか言ってるうちに剥がされてく', 6, 2)).toBeUndefined();
    const badge = { id: 'b', kind: 'badge' as const, z: 1 };
    expect(fits(badge, 'かい！')).toBeUndefined();
    expect(fits(badge, 'そーれっそーれっそーれっそーれっ')).toMatch(/超過 2 行/);
    // 24 characters: a ticket wraps them on two rows; a fan board refuses them
    const long = 'ああしたいこうしたいが止まらないのに現実はリアル';
    expect([...long].length).toBe(24);
    expect(fits({ id: 't', kind: 'ticket', z: 1 }, long)).toBeUndefined();
    expect(fits({ id: 'f', kind: 'fans', z: 1 }, long)).toMatch(/超過/);
    expect(fits({ id: 's', kind: 'shout', z: 1 }, 'ドドドド！')).toBeUndefined();
  });

  it('catches flat type too close to its ground before anything is rendered', () => {
    const s = storm();
    s.parts[2].params = { mode: 'stack', color: '#FF5FA2', ink: '#FFFFFF' };
    expect(contrastErrors(s).join('\n')).toMatch(/字色 #FFFFFF 在 #FF5FA2 上對比只有 2\.\d:1/);
    s.parts[2].params = { mode: 'stack', color: '#FFFFFF', ink: '#000000' };
    expect(contrastErrors(s)).toEqual([]);
  });

  it('never ends a row on a small tsu', () => {
    expect(posterPhrases('永遠の推しになっちゃうぜ').map((x) => x.text)).not.toContain('永遠の推しになっ');
  });

  it('finds a scene laid out like one of an earlier song, whatever light is on', () => {
    const s = storm();
    s.parts[0].params = { look: 'backlight' };
    expect(reusedSkeletons([s], [{ song: 'i REVOLUTION', skeletons: ['dark|band+led'] }])).toEqual([{ scene: 's1', skeleton: 'dark|band+led', song: 'i REVOLUTION' }]);
    expect(reusedSkeletons([s], [{ song: 'x', skeletons: ['bright|band+led'] }])).toEqual([]);
  });

  it('lets an echo repeat a word behind a line carried elsewhere', () => {
    const s = storm();
    s.parts.push({ id: 'echo', kind: 'echo', z: 0, params: { word: 'ねえ' }, lines: [{ cueId: 'c1', role: 'echo' }] });
    expect(checkScenes([s], song, new Set(['c1', 'c2', 'c3'])).errors).toEqual([]);
    s.parts[3].params = { word: '優勝' };
    expect(checkScenes([s], song, new Set(['c1', 'c2', 'c3'])).errors.join('\n')).toMatch(/c1 裡沒有「優勝」/);
  });

  it('sends back an echo too faint to be seen on its ground', () => {
    const s = storm();
    s.parts[0].params = { look: 'gingham', base: '#FFE1EE', color: '#FFFFFF' };
    s.parts.push({ id: 'echo', kind: 'echo', z: 0, params: { word: 'ねえ', color: '#FFFFFF', alpha: 0.28 }, lines: [{ cueId: 'c1', role: 'echo' }] });
    expect(contrastErrors(s).join('\n')).toMatch(/幾乎看不見/);
    s.parts[3].params = { word: 'ねえ', color: '#FF3D8B', alpha: 0.4 };
    expect(contrastErrors(s).filter((e) => e.includes('回音'))).toEqual([]);
  });

  it('opens a scene through the transition the scene before ends on', () => {
    const a: Scene = { id: 'a', start: 0, end: 5, intent: 'x', parts: [], exit: 'shatter' };
    const b: Scene = { id: 'b', start: 5, end: 9, intent: 'x', parts: [], exit: 'flash' };
    const c: Scene = { id: 'c', start: 9, end: 12, intent: 'x', parts: [] };
    expect(enterSec([a, b, c], b)).toBe(1.1);
    expect(enterSec([a, b, c], c)).toBe(0); // a flash is two white frames, not a transition
    expect(enterSec([a, b, c], a)).toBe(0);
  });

  it('pushes the camera in through a build-up and punches it on the drop', () => {
    const m = [{ kind: 'build', at: 10, dur: 4 }, { kind: 'drop', at: 10 }];
    expect(momentCamera(m, 5)).toEqual({ zoom: 1, flash: false });
    expect(momentCamera(m, 8).zoom).toBeCloseTo(1.025);
    expect(momentCamera(m, 10.03)).toMatchObject({ flash: true });
    expect(momentCamera(m, 10.03).zoom).toBeGreaterThan(1.06);
    expect(momentCamera(m, 12).zoom).toBeCloseTo(1, 3);
  });

  it('tells one crowd from another by what it holds and how it moves', () => {
    const s = storm();
    s.parts[0].params = { penlights: ['#FF5FA2'] };
    expect(sceneMotifs(s)).toEqual(['penlights:sticks:wave']);
    s.parts[0].params = { penlights: ['#FF5FA2'], crowd: 'hearts', crowdMotion: 'pulse' };
    expect(sceneMotifs(s)).toEqual(['penlights:hearts:pulse']);
    s.parts[0].params = { penlights: [] };
    expect(sceneMotifs(s)).toEqual([]);
  });

  it('refuses type asked smaller than readable and two text parts in one band of the frame', () => {
    const s = storm();
    s.parts[2].params = { mode: 'stack', size: 60 };
    s.parts.push({ id: 'p', kind: 'poster', z: 3, params: { y: -0.4, height: 0.3 }, lines: [] });
    const errs = checkScenes([s], song, new Set(['c1', 'c2', 'c3'])).errors.join('\n');
    expect(errs).toMatch(/size 60 小於最小可讀字級 72px/);
  });
});

describe('holders', () => {
  it('names the parts that hold a long lead line, never the one-row band', async () => {
    const { holders } = await import('./scene');
    const long = holders('楽しいと嬉しいとよくできました集めていいこいいこ', 'lead');
    expect(long).not.toContain('band');
    expect(long.length).toBeGreaterThan(0);
    expect(holders('てぇてぇ', 'lead')).toContain('band');
  });
});

describe('story props and empty stretches', () => {
  const intro = (parts: Scene['parts']): Scene => ({ id: 's0', start: 0, end: 10, intent: '前奏', parts });
  it('refuses a scene that shows only its ground for long, and a prop too small to be a thing in it', () => {
    const errs = checkScenes([intro([{ id: 't', kind: 'title', z: 1 }, { id: 'o', kind: 'object', z: 2, params: { prop: 'clock.alarm', size: 0.15 } }])], song, new Set()).errors;
    expect(errs.some((e) => e.includes('太小'))).toBe(true);
    expect(errs.some((e) => e.includes('只有底'))).toBe(false);
    const bare = checkScenes([{ ...intro([{ id: 't', kind: 'title', z: 1 }]), end: 14 }], song, new Set()).errors;
    expect(bare.some((e) => e.includes('6.0–14.0 秒畫面上只有底'))).toBe(true);
  });
  it('keeps a prop bound to no line up for the whole scene', () => {
    const shown = shownTexts(intro([{ id: 'o', kind: 'object', z: 2, params: { prop: 'clock.alarm', size: 0.4 } }]), song);
    expect(shown.map((x) => [x.text, x.to])).toEqual([['clock.alarm', 10]]);
  });
});

describe('leadNeed', () => {
  it('asks a long line sung fast for no more time than the song gives it before the next line', async () => {
    const { leadNeed, readSec } = await import('./scene');
    const fast: SceneSong = { beats: [], downbeats: [], cues: [{ id: 'a', start: 0, end: 2.7, text: 'ちょっとのハッピーつかまえ ビッグに喜べ～!' }, { id: 'b', start: 2.72, end: 5, text: '星占い' }] };
    expect(leadNeed('a', fast.cues[0].text, fast)).toBeCloseTo(2.27, 2);
    expect(leadNeed('b', 'ほし', fast)).toBe(readSec('ほし'));
  });
});
