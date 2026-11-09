# Hold events on the frames (scripts/lyric-vj/hold-events.mts --render): for each planned event, in its own window
# [at, at + sec], the composite's largest frame-to-frame change of its own (not also changing with events off) and its
# largest difference from the same render with no events (same seed), past what already differed before it (each event
# counted once: the entrance is over before the window opens); by layer: text (the lyric layer, carriers in), words (without them), carrier (text less words),
# ground (the composite outside the lyric layer); plus how much of the ink changed colour.
#   python hold_measure.py <dir> <song.json> <a> <b>
# A pixel has changed when one channel moves more than THRESH of 255; shares are of the 960x540 frame.
import glob, json, subprocess, sys
import numpy as np

W, H, FPS = 960, 540, 30
THRESH = 24
PASS = 0.02
INK_PASS = 0.15
# after the event, the on/off difference is looked for this many frames more (a settled state stays)
AFTER = 9


def frames(path, rgba, keep):
    """The frames whose index is in keep, as uint8 arrays (straight RGBA or RGB)."""
    fmt, ch = ('rgba', 4) if rgba else ('rgb24', 3)
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={FPS},scale={W}:{H}', '-pix_fmt', fmt, '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    size, out, i = W * H * ch, {}, 0
    last = max(keep) if keep else -1
    while i <= last:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        if i in keep:
            out[i] = np.frombuffer(buf, np.uint8).reshape(H, W, ch)
        i += 1
    p.stdout.close(); p.kill()
    return out


def premul(x):
    if x.shape[2] == 3:
        return x.astype(np.int16), None
    a = x[..., 3:4].astype(np.float32) / 255
    return np.concatenate([(x[..., :3] * a), x[..., 3:4]], 2).astype(np.int16), x[..., 3]


def changed(x, y):
    return np.abs(x - y).max(2) > THRESH


def one(path):
    got = glob.glob(path)
    return got[0] if got else None


def main(d, song_path, a, b):
    rows = json.load(open(f'{d}/rows.json'))
    events = [r for r in rows if r.get('kind')]
    want = set()
    spans = {}
    for r in events:
        f0 = max(1, int(np.floor((r['at'] - a) * FPS)))
        f1 = int(np.ceil((r['at'] + r['sec'] - a) * FPS)) + 1
        spans[r['cue']] = (f0, f1)
        want |= set(range(f0 - 1, f1 + AFTER + 1))
    paths = {k: one(f'{d}/{k}/*vocal_*') for k in ['on-full', 'off-full', 'on-text', 'off-text', 'on-words', 'off-words']}
    fr = {k: frames(p, 'full' not in k, want) if p else {} for k, p in paths.items()}
    out = []
    for r in rows:
        row = {'cue': r['cue'], 'len': r['len'], 'bucket': r['bucket'], 'kind': r.get('kind'), 'skip': r.get('skip')}
        if not r.get('kind'):
            out.append(row); continue
        f0, f1 = spans[r['cue']]
        if r['at'] + r['sec'] > b:
            row['beyond'] = True
            out.append(row); continue
        res = {}
        def get(k, f):
            x = fr[k].get(f)
            return None if x is None else premul(x)
        # per layer: peak = largest frame-to-frame change inside the window (events on), base = the same with events off,
        # onoff = largest on/off difference from the window's start to AFTER frames past it
        for layer in ['full', 'text', 'words', 'carrier', 'ground']:
            src = {'full': 'full', 'text': 'text', 'words': 'words', 'carrier': 'text', 'ground': 'full'}[layer]
            if not fr[f'on-{src}']:
                continue
            def mask(f, which):
                if layer == 'carrier':
                    w = fr[f'{which}-words'].get(f)
                    return None if w is None else w[..., 3] < 16
                if layer == 'ground':
                    t = fr[f'{which}-text'].get(f)
                    return None if t is None else t[..., 3] < 16
                return None
            def share(x, y, m):
                c = changed(x, y)
                if m is not None:
                    c &= m
                return float(c.mean())
            # peak: the event's own frame-to-frame change (changed with events on, not changed with them off);
            # onoff: pixels on and off differ that did not differ the frame before the event (a layout set for the whole
            # line, a grown block's room, is not the event)
            peak = raw = base = onoff = 0.0
            def pair(which, f):
                x, y = get(f'{which}-{src}', f), get(f'{which}-{src}', f - 1)
                if x is None or y is None:
                    return None
                c = changed(x[0], y[0])
                m, m2 = mask(f, which), mask(f - 1, which)
                return c & m & m2 if m is not None and m2 is not None else c
            for f in range(f0, f1 + 1):
                on_c, off_c = pair('on', f), pair('off', f)
                if on_c is None or off_c is None:
                    continue
                raw, base = max(raw, float(on_c.mean())), max(base, float(off_c.mean()))
                peak = max(peak, float((on_c & ~off_c).mean()))
            def apart(f):
                x, y = get(f'on-{src}', f), get(f'off-{src}', f)
                if x is None or y is None:
                    return None
                c = changed(x[0], y[0])
                m, m2 = mask(f, 'on'), mask(f, 'off')
                return c & m & m2 if m is not None and m2 is not None else c
            pre = apart(f0 - 1)
            for f in range(f0, f1 + AFTER + 1):
                c = apart(f)
                if c is None:
                    continue
                onoff = max(onoff, float((c & ~pre).mean() if pre is not None else c.mean()))
            res[layer] = {'peak': round(peak * 100, 2), 'raw': round(raw * 100, 2), 'base': round(base * 100, 2), 'onoff': round(onoff * 100, 2), 'pass': peak > PASS and onoff > PASS}
        # ink colour: of the pixels inked in both renders (words layer, solid), the share whose colour moved, less those that
        # had moved already the frame before the event (an ink set for the whole line is not the event)
        ink, best = 0.0, 0.0
        if fr['on-words']:
            def moved_at(f):
                x, y = fr['on-words'].get(f), fr['off-words'].get(f)
                if x is None or y is None:
                    return None, None
                both = (x[..., 3] > 200) & (y[..., 3] > 200)
                return (np.abs(x[..., :3].astype(np.int16) - y[..., :3].astype(np.int16)).max(2) > 40) & both, both
            pre, _ = moved_at(f0 - 1)
            for f in range(f0, f1 + AFTER + 1):
                moved, both = moved_at(f)
                if moved is None or both.sum() < 50:
                    continue
                if pre is not None:
                    moved = moved & ~pre
                if moved.sum() / both.sum() > ink:
                    ink, best = float(moved.sum() / both.sum()), float(moved.mean())
        row.update({'window': [round(a + f0 / FPS, 2), round(a + f1 / FPS, 2)], 'layers': res, 'ink_changed': round(ink * 100, 1), 'ink_frame': round(best * 100, 2)})
        # the gate (2026-11-09, round 2): the lyric layer moves past 2 % of the frame on its own and against no events, or the
        # ink of the line changes colour over at least 15 % of it; the whole frame's 2 % is kept as a reference only
        row['pass'] = bool(res.get('text', {}).get('pass')) or ink >= INK_PASS
        row['silent'] = all(v['onoff'] < 0.1 and v['peak'] < 0.1 for v in res.values()) and ink < 0.01
        out.append(row)
    buckets = {}
    for k in ['0-0.6', '0.6-1.5', '1.5-3', '>3']:
        of = [r for r in out if r['bucket'] == k]
        ev = [r for r in of if r.get('kind') and not r.get('beyond')]
        lay = {L: sum(1 for r in ev if r['layers'].get(L, {}).get('pass')) for L in ['full', 'text', 'words', 'carrier', 'ground']}
        planned = [r for r in of if r.get('kind')]
        gate = sum(1 for r in ev if r['pass'])
        buckets[k] = {'lines': len(of), 'events': len(planned), 'event_share': round(len(planned) / len(of), 2) if of else None, 'measured': len(ev),
                      'gate_pass': gate, 'gate_pass_share': round(gate / len(ev), 2) if ev else None, 'silent': sum(1 for r in ev if r['silent']),
                      'composite_pass': lay['full'], 'composite_pass_share': round(lay['full'] / len(ev), 2) if ev else None,
                      'layer_pass': lay, 'ink_colour_events': sum(1 for r in ev if r['ink_changed'] >= 15)}
    skips = {}
    for r in out:
        if r.get('skip'):
            skips[r['skip']] = skips.get(r['skip'], 0) + 1
    res = {'buckets': buckets, 'skips': skips, 'rows': out}
    json.dump(res, open(f'{d}/measure.json', 'w'), indent=1)
    print(d, json.dumps(buckets))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
