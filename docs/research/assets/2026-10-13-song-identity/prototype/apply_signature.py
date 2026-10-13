"""Prototype: a song signature applied to an existing treatment (no API).

The signature is what the director would write once per song under the proposed rule (here written by hand from each
song's own concept). This script is the local half: the same rules for every song, keeping each section's own inks and
assets, changing only the composition skeleton, the photo's role, the chorus lift and the lyric face.

usage: python3 apply_signature.py <treatment.json> <signature.json> <out.json>
"""
import json
import sys

GROUNDS = {'skyline'}


def shade(hexc, k):
    """Darken (k < 1) or lighten (k > 1) a #rrggbb ink."""
    c = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
    c = [min(255, round(v * k)) if k <= 1 else round(v + (255 - v) * (k - 1)) for v in c]
    return '#%02X%02X%02X' % tuple(c)


def lifted(section, moments, arc):
    """A chorus section: a drop, hold or finale starts in it, or the arc is at its top level."""
    s, e = section['start'], section.get('_end', 1e9)
    if any(m['kind'] in ('drop', 'hold', 'finale') and s - 0.5 <= m['at'] < e for m in moments):
        return True
    lv = [a['level'] for a in arc if s - 0.5 <= a['start'] < e]
    return bool(lv) and max(lv) >= 3


def sky_inks(layers):
    for l in layers:
        if l['kind'] == 'bands':
            return l['colors']
    return None


def apply(t, sig):
    g = t['graphics']
    secs = g['sections']
    for i, s in enumerate(secs):
        s['_end'] = secs[i + 1]['start'] if i + 1 < len(secs) else 1e9
    flip = 0
    for s in secs:
        up = lifted(s, t.get('moments', []), t.get('arc', []))
        hz = sig['chorusHorizon'] if up else sig['horizon']
        ls = s['layers']
        inks = sky_inks(ls)
        keep = [l for l in ls if l['kind'] not in GROUNDS | {'bands'}]
        ground = []
        world = sig['world']
        if world == 'sea' and inks:
            # sky down to the horizon, the sea under it: two sea inks alternating, so the thin seam stripes the bands
            # print between steps read as glints on water, not as more sky
            deep, mid = shade(inks[0], 0.8), shade(inks[min(1, len(inks) - 1)], 0.9)
            ground = [{'kind': 'bands', 'colors': inks, 'from': 0, 'to': hz},
                      {'kind': 'bands', 'colors': [mid, deep] * 3, 'from': hz, 'to': 1}]
        elif world == 'space' and inks:
            # no land: the whole frame is sky, and the ground is the curve of a planet rising from the bottom
            ground = [{'kind': 'bands', 'colors': inks, 'from': 0, 'to': 1}]
            r = 0.75 if up else 0.42
            planet = {'kind': 'blob', 'x': 0 if up else 0.45, 'y': -1.0 - (0 if up else 0.05), 'r': r, 'color': shade(inks[-1], 1.25) if up else shade(inks[0], 0.7)}
            orbit = {'kind': 'rings', 'x': planet['x'], 'y': planet['y'], 'count': 4 if up else 2, 'color': s.get('accent') or '#F2E3C2'}
            keep = [l for l in keep if l['kind'] not in ('blob', 'rings')] + [planet, orbit]
        elif world in ('windows', 'embankment'):
            if inks:
                # embankment: the long low line of a river bank, sky inks above a flat paper ground; windows keep the
                # section's own bands where it had them
                ground = [{'kind': 'bands', 'colors': inks, 'from': 0, 'to': hz}] if world == 'embankment' else [l for l in ls if l['kind'] == 'bands']
        for l in keep:
            if l['kind'] == 'photo':
                role = sig['chorusPicture'] if up else sig['picture']
                l.pop('r', None)
                if role == 'band':
                    l.update(mode='band', y=round(1 - 2 * hz - 0.18, 2) if world != 'embankment' else -0.42)
                elif role == 'circle':
                    flip ^= 1
                    l.update(mode='circle', w=0.36 if up else 0.24, x=0 if up else (0.5 if flip else -0.5), y=0.05 if up else -0.1)
                elif role == 'full':
                    # one ink over the whole picture (a language that inks its photos keeps doing so full-bleed)
                    l.update(mode='full', tint=sig.get('ink') or l.get('tint'))
            if l['kind'] == 'blob' and world == 'sea' and up:
                # the chorus sun rises on the horizon: half above, half under the line
                l.update(x=0, y=round(1 - 2 * hz, 2), r=0.3)
            if l['kind'] == 'band' and world == 'windows':
                l['_drop'] = True  # diagonal tapes belong to the bank-and-rail world, not to round windows
        keep = [l for l in keep if not l.get('_drop')]
        if world == 'embankment' and up:
            keep += [{'kind': 'band', 'type': 'solid', 'y': -0.62, 'angle': -10, 'height': 70, 'color': s.get('accent') or '#3A57A8'}]
        s['layers'] = [l for l in keep if l['kind'] == 'paper'] + ground + [l for l in keep if l['kind'] != 'paper']
    for s in secs:
        s.pop('_end', None)
    if sig.get('font'):
        t['design']['font'] = sig['font']
    return t


if __name__ == '__main__':
    t = json.load(open(sys.argv[1]))
    sig = json.load(open(sys.argv[2]))
    json.dump(apply(t, sig), open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
