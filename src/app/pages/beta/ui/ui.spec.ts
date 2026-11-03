import { balance, panelAfter, QUOTA_HELP } from './balance';
import { askRows, bill } from './confirm';
import { formatPrice } from './price';
import { pollGate, signedOutBy } from './session';
import { shellFor } from './shell';
import { STATUS_CHIP } from './status';

describe('formatPrice', () => {
  it('shows two decimals by default', () => {
    expect(formatPrice(14.5)).toBe('14.50');
    expect(formatPrice(16)).toBe('16.00');
    expect(formatPrice(0)).toBe('0.00');
  });
  it('drops needless zeros in the short form', () => {
    expect(formatPrice(16, 'short')).toBe('16');
    expect(formatPrice(2.5, 'short')).toBe('2.5');
    expect(formatPrice(13.5, 'short')).toBe('13.5');
    expect(formatPrice(0.25, 'short')).toBe('0.25');
  });
  it('rounds float noise and never prints -0', () => {
    expect(formatPrice(14.5 - 2.5 - 0.1 + 0.1)).toBe('12.00');
    expect(formatPrice(0.1 + 0.2, 'short')).toBe('0.3');
    expect(formatPrice(-0.001)).toBe('0.00');
    expect(formatPrice(-1.5)).toBe('-1.50');
  });
});

describe('bill', () => {
  it('lists this cost, the balance now and after', () => {
    expect(bill(2.5, 14.5)).toEqual({ cost: 2.5, left: 14.5, after: 12, short: false });
  });
  it('is short when the cost is more than the balance', () => {
    expect(bill(16, 4)).toEqual({ cost: 16, left: 4, after: -12, short: true });
    expect(bill(4, 4).short).toBe(false);
  });
  it('rounds to cents so 0.1 + 0.2 style sums do not flip short', () => {
    expect(bill(0.3, 0.1 + 0.2).short).toBe(false);
  });
  it('without a known balance shows only the cost', () => {
    expect(bill(2.5, null)).toEqual({ cost: 2.5, short: false });
  });
});

describe('balance', () => {
  it('is what is left and the share of the limit still left', () => {
    expect(balance({ limitUsd: 30, spentUsd: 15.5 })).toEqual({ left: 14.5, pct: 48.33 });
  });
  it('never goes below zero or past 100', () => {
    expect(balance({ limitUsd: 10, spentUsd: 12 })).toEqual({ left: 0, pct: 0 });
    expect(balance({ limitUsd: 0, spentUsd: 0 })).toEqual({ left: 0, pct: 0 });
  });
});

describe('STATUS_CHIP', () => {
  it('pairs each song status with its README icon, label and tone', () => {
    expect(STATUS_CHIP.preparing).toEqual({ icon: '◐', label: '準備中', tone: 'info' });
    expect(STATUS_CHIP.noAudio).toEqual({ icon: '!', label: '等音檔', tone: 'warn' });
    expect(STATUS_CHIP.timing).toEqual({ icon: '◷', label: '待確認時間', tone: 'warn' });
    expect(STATUS_CHIP.ready).toEqual({ icon: '✓', label: '可製作', tone: 'ok' });
    expect(STATUS_CHIP.making).toEqual({ icon: '●', label: '製作中', tone: 'making' });
    expect(STATUS_CHIP.retrying).toEqual({ icon: '↻', label: '自動重試中', tone: 'warn' });
    expect(STATUS_CHIP.help).toEqual({ icon: '!', label: '需要協助', tone: 'bad' });
    expect(STATUS_CHIP.concept).toEqual({ icon: '?', label: '概念待確認', tone: 'warn' });
    expect(STATUS_CHIP.prepFailed).toEqual({ icon: '!', label: '準備失敗', tone: 'bad' });
  });
});

describe('shellFor', () => {
  it('marks the tab and the phone top bar for each beta page', () => {
    expect(shellFor('beta')).toEqual({ active: 'songs', title: '我的歌曲' });
    expect(shellFor('beta-song')).toEqual({ active: 'songs', title: '', back: { href: '/my', label: '我的歌曲' }, ownTop: true });
    expect(shellFor('beta-new')).toEqual({ active: 'songs', title: '做一支新影片', back: { href: '/my', label: '我的歌曲' } });
    expect(shellFor('beta-styles')).toEqual({ active: 'styles', title: '風格' });
    expect(shellFor('beta-admin')).toEqual({ active: 'admin', title: '管理' });
    expect(shellFor('beta-admin-song')).toEqual({ active: 'admin', title: '', back: { href: '/my/admin', label: '管理' }, ownTop: true });
  });
  it('frames the timing editor only for a tester song', () => {
    expect(shellFor('timing', '?beta=abc')).toEqual({ active: 'songs', title: '歌詞時間', back: { href: '/my', label: '我的歌曲' }, ownTop: true });
    expect(shellFor('timing', '?song=abc')).toBeUndefined();
  });
  it('leaves the other pages without a shell', () => {
    expect(shellFor('timing')).toBeUndefined();
    expect(shellFor('home')).toBeUndefined();
  });
});

describe('askRows', () => {
  it('bills a paying ask and shows no rows for a warning that charges nothing', () => {
    expect(askRows({ cost: 2.5 }, 4)).toEqual({ cost: 2.5, left: 4, after: 1.5, short: false });
    expect(askRows({ cost: 0 }, 4)).toBeNull();
    expect(askRows({ cost: 0 }, null)).toBeNull();
  });
});

describe('panelAfter', () => {
  it('toggles on the 額度 button', () => {
    expect(panelAfter(false, 'toggle')).toBe(true);
    expect(panelAfter(true, 'toggle')).toBe(false);
  });
  it('closes on Escape or a click outside the pill, and never opens from them', () => {
    expect(panelAfter(true, 'escape')).toBe(false);
    expect(panelAfter(true, 'outside')).toBe(false);
    expect(panelAfter(false, 'escape')).toBe(false);
    expect(panelAfter(false, 'outside')).toBe(false);
  });
  it('sends people to whoever invited them, not to a payment', () => {
    expect(QUOTA_HELP.join('')).toContain('請聯絡邀請你的人');
    expect(QUOTA_HELP.join('')).toContain('不需要付款');
  });
});

describe('signedOutBy', () => {
  it('is a 401 only; other statuses are errors, not a sign-out', () => {
    expect(signedOutBy(401)).toBe(true);
    for (const s of [200, 403, 404, 500, 502]) expect(signedOutBy(s)).toBe(false);
  });
});

describe('pollGate', () => {
  it('keeps only the newest poll', () => {
    const g = pollGate();
    const a = g.begin();
    const b = g.begin();
    expect(g.latest(a)).toBe(false);
    expect(g.latest(b)).toBe(true);
  });
  it('drops a slow poll that began before a 401, so it cannot refill the lists', () => {
    const g = pollGate();
    const slow = g.begin();
    g.signOut();
    expect(g.latest(slow)).toBe(false);
  });
  it('takes a poll begun after the 401 (signed in again)', () => {
    const g = pollGate();
    g.begin();
    g.signOut();
    expect(g.latest(g.begin())).toBe(true);
  });
});
