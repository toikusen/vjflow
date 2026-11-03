import { stepsMin } from './beta';
import { canSave, fileTitle, guessLanguage, guessTitle, SAVE_REST, sheetRows, stripSteps } from './new-song';

describe('sheetRows', () => {
  it('marks headings and section labels as lines the video never shows, keeps the rest', () => {
    expect(sheetRows('# 夜航\n[Verse 1]\n朝からアラーム\n\n[01:02.30]二行\n[ti:x]').map((r) => r.kind)).toEqual(['heading', 'section', 'line', 'blank', 'line', 'section']);
  });
  it('keeps each line\'s own text, so the sheet lines up with the box', () => {
    expect(sheetRows('  a  \nb').map((r) => r.text)).toEqual(['  a  ', 'b']);
  });
  it('a time stamp alone is a line, not a section', () => {
    expect(sheetRows('[01:02]').map((r) => r.kind)).toEqual(['line']);
  });
});

describe('guessTitle', () => {
  it('takes the first heading, else the file name without its extension, else nothing', () => {
    expect(guessTitle('[Verse]\n# 夜航 \n## other', 'song.mp3')).toBe('夜航');
    expect(guessTitle('朝から', 'My Song.final.m4a')).toBe('My Song.final');
    expect(guessTitle('', '')).toBe('');
    expect(fileTitle('a.b.wav')).toBe('a.b');
  });
  it('a heading that is not alone on its line does not count', () => {
    expect(guessTitle('#tag\nline', 'f.mp3')).toBe('f');
  });
});

describe('guessLanguage', () => {
  it('reads the script: kana → ja, hangul → ko, han → zh, else en, nothing → empty', () => {
    expect(guessLanguage('朝からアラーム 鳴り響く')).toBe('ja');
    expect(guessLanguage('사랑해요 오늘도')).toBe('ko');
    expect(guessLanguage('夜晚的橋邊在飄雪')).toBe('zh');
    expect(guessLanguage('we walk along the river')).toBe('en');
    expect(guessLanguage('[Verse 1]\n...')).toBe('');
  });
  it('a Chinese song with a few English words stays Chinese; a Japanese song with kanji stays Japanese', () => {
    expect(guessLanguage('我愛你 baby 每一天 oh yeah')).toBe('zh');
    expect(guessLanguage('東京の夜 街灯の下で')).toBe('ja');
  });
});

describe('canSave', () => {
  const ok = { file: true, lines: 3, title: 'T', problem: '', saved: false };
  it('needs audio, sung lines, a title and clean lyrics, once', () => {
    expect(canSave(ok)).toBe(true);
    expect(canSave({ ...ok, file: false })).toBe(false);
    expect(canSave({ ...ok, lines: 0 })).toBe(false);
    expect(canSave({ ...ok, title: '  ' })).toBe(false);
    expect(canSave({ ...ok, problem: '第 3 行太長' })).toBe(false);
    expect(canSave({ ...ok, saved: true })).toBe(false);
  });
  it('waits four seconds after the lyrics last changed', () => {
    expect(SAVE_REST).toBe(4000);
  });
});

describe('stripSteps', () => {
  const base = { uploadPct: null, uploadError: '', uploaded: false, prepFailed: false, aligned: false };
  const states = (x: Parameters<typeof stripSteps>[0]) => stripSteps(x).map((s) => s.state);
  it('lights the three cells in order: upload, saved and aligning, export', () => {
    expect(states(base)).toEqual(['next', 'next', 'next']);
    expect(stripSteps({ ...base, uploadPct: 62 })[0]).toEqual({ label: '上傳 62%', state: 'now' });
    const aligning = stripSteps({ ...base, uploadPct: 100, uploaded: true, prepLeftMin: 17 });
    expect(aligning.map((s) => s.label)).toEqual(['已上傳', '已存到我的歌曲 · 對準歌詞時間中，約 17 分鐘', '可以匯出']);
    expect(aligning.map((s) => s.state)).toEqual(['done', 'now', 'next']);
    const done = stripSteps({ ...base, uploadPct: 100, uploaded: true, aligned: true });
    expect(done.map((s) => s.label)).toEqual(['已上傳', '已存到我的歌曲', '時間已對準，可以匯出']);
    expect(done.map((s) => s.state)).toEqual(['done', 'done', 'done']);
  });
  it('shows a failed upload with its reason, and a failed preparation', () => {
    expect(stripSteps({ ...base, uploadPct: 40, uploadError: '連線中斷' })[0]).toEqual({ label: '上傳失敗：連線中斷', state: 'bad' });
    expect(stripSteps({ ...base, uploaded: true, prepFailed: true })[1].state).toBe('bad');
  });
  it('falls back to the preparation estimate and never claims 100 % before the server answered', () => {
    expect(stripSteps({ ...base, uploaded: true })[1].label).toContain(`約 ${stepsMin('prep')} 分鐘`);
    expect(stripSteps({ ...base, uploadPct: 100 })[0].label).toBe('上傳 99%');
  });
});
