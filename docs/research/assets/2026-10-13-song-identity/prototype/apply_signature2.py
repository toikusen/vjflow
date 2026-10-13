"""Prototype v2: a song signature applied to an existing treatment (no API).

The signature (written by hand here, as the director would under the proposed rule) has two parts:
  scene      — where the song happens, which decides the ground: 'sea' | 'space' | 'riverbank' | None (keep the ground)
  composition — horizon / chorusHorizon (sky height, 0..1 from the top), picture / chorusPicture
                ('keep' | 'band' | 'circle' | 'full'), layout ('round' | 'linear' | None), ink, font

Only the skeleton is replaced: the sky bands (a `bands` layer from the top) and the ground silhouette (`skyline`).
Everything else the director placed — suns, moons, rings, tapes, shapes, photos' assets — stays. Layers this script adds
are tagged `sig`; layers it changes keep their original under `sigFrom`; layers it replaces are kept in the section's
`sigRemoved`. So `strip` restores the input exactly, applying twice equals applying once, and the input is never
modified.

usage: python3 apply_signature2.py <treatment.json> <signature.json> <out.json>
"""
import copy
import json
import sys


def shade(hexc, k):
    """Darken (k < 1) or lighten (k > 1) a #rrggbb ink."""
    c = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
    c = [min(255, round(v * k)) if k <= 1 else round(v + (255 - v) * (k - 1)) for v in c]
    return '#%02X%02X%02X' % tuple(c)


def is_sky(l):
    return l['kind'] == 'bands' and (l.get('from') or 0) == 0 and len(l.get('colors') or []) >= 2


def strip(t):
    """The treatment as it was before any signature: added layers dropped, changed ones restored, replaced ones back."""
    t = copy.deepcopy(t)
    for s in t.get('graphics', {}).get('sections', []):
        removed = s.pop('sigRemoved', [])
        layers = []
        for l in s['layers']:
            if l.get('sig') == 'added':
                continue
            layers.append(l['sigFrom'] if 'sigFrom' in l else l)
        # replaced layers go back where they were
        for i, l in removed:
            layers.insert(min(i, len(layers)), l)
        s['layers'] = layers
    d = t.get('design', {})
    if 'sigFontFrom' in d:
        f = d.pop('sigFontFrom')
        if f is None:
            d.pop('font', None)
        else:
            d['font'] = f
    t.get('design', {}).pop('signature', None)
    return t


def lifted(s, end, moments, arc):
    """A chorus section: a drop, hold or finale starts in it, or the arc reaches its top level in it. A moment within
    0.5 s of a section start belongs to that section (世界のつづき: a drop at 53.59 s, the next section at 53.6 s)."""
    inside = lambda x: s['start'] - 0.5 <= x < end - 0.5
    if any(m['kind'] in ('drop', 'hold', 'finale') and inside(m['at']) for m in moments):
        return True
    lv = [a['level'] for a in arc if inside(a['start'])]
    return bool(lv) and max(lv) >= 3


def added(l):
    return {**l, 'sig': 'added'}


def changed(l, **kw):
    return {**{k: v for k, v in l.items() if k != 'sigFrom'}, **kw, 'sig': 'changed', 'sigFrom': l}


def apply(t0, sig):
    t = strip(t0)
    secs = t.get('graphics', {}).get('sections', [])
    flip = 0
    for i, s in enumerate(secs):
        end = secs[i + 1]['start'] if i + 1 < len(secs) else float('inf')
        up = lifted(s, end, t.get('moments', []), t.get('arc', []))
        hz = sig.get('chorusHorizon' if up else 'horizon')
        sky = next((l for l in s['layers'] if is_sky(l)), None)
        scene = sig.get('scene')
        out, removed = [], []
        for j, l in enumerate(s['layers']):
            replace = sky is not None and hz is not None and scene in ('sea', 'space', 'riverbank') and (l is sky or l['kind'] == 'skyline')
            if replace:
                removed.append([j, l])
                continue
            out.append(l)
        if sky is not None and hz is not None and scene in ('sea', 'space', 'riverbank'):
            inks = sky['colors']
            ground = []
            if scene == 'sea':
                # sky to the horizon, then two sea inks alternating: the seam stripes the bands print read as glints
                deep, mid = shade(inks[0], 0.8), shade(inks[1], 0.9)
                ground = [added({'kind': 'bands', 'colors': inks, 'from': 0, 'to': hz}), added({'kind': 'bands', 'colors': [mid, deep] * 3, 'from': hz, 'to': 1})]
            elif scene == 'space':
                ground = [added({'kind': 'bands', 'colors': inks, 'from': 0, 'to': 1})]
                # a planet rising from the bottom, unless the director already put one there
                if not any(l['kind'] == 'blob' and (l.get('y') or 0) < -0.8 and (l.get('r') or 0) >= 0.4 for l in out):
                    ground += [added({'kind': 'blob', 'x': 0 if up else 0.45, 'y': -1.0 if up else -1.05, 'r': 0.75 if up else 0.42, 'color': shade(inks[-1], 1.25) if up else shade(inks[0], 0.7), 'fixed': True})]
            elif scene == 'riverbank':
                # the long low line of a river bank: the sky over a flat paper ground
                ground = [added({'kind': 'bands', 'colors': inks, 'from': 0, 'to': hz})]
            k = next((n for n, l in enumerate(out) if l['kind'] == 'paper'), -1)
            out = out[:k + 1] + ground + out[k + 1:]
        role = sig.get('chorusPicture' if up else 'picture', 'keep')
        for n, l in enumerate(out):
            if l['kind'] != 'photo' or role == 'keep':
                continue
            if role == 'band':
                # on a river bank the picture is the bank itself, a strip along the bottom, under where lines sit
                y = -0.62 if scene == 'riverbank' or hz is None else round(1 - 2 * hz - 0.18, 2)
                out[n] = changed(l, mode='band', y=y)
            elif role == 'circle':
                flip ^= 1
                out[n] = changed(l, mode='circle', w=0.36 if up else 0.24, x=0 if up else (0.5 if flip else -0.5), y=0.05 if up else -0.1)
            elif role == 'full':
                out[n] = changed(l, mode='full', **({'tint': sig['ink']} if sig.get('ink') else {}))
        if scene == 'sea' and up and hz is not None:
            # the chorus sun on the horizon (the director's own sun, moved; none is added)
            out = [changed(l, x=0, y=round(1 - 2 * hz, 2), r=0.3) if l['kind'] == 'blob' and l.get('sig') != 'added' else l for l in out]
        if sig.get('layout') == 'linear' and up:
            out.append(added({'kind': 'band', 'type': 'solid', 'y': -0.62, 'angle': -10, 'height': 70, 'color': s.get('accent') or sig.get('ink') or '#3A57A8'}))
        s['layers'] = out
        if removed:
            s['sigRemoved'] = removed
    if sig.get('font'):
        t['design']['sigFontFrom'] = t['design'].get('font')
        t['design']['font'] = sig['font']
    t['design']['signature'] = sig
    return t


if __name__ == '__main__':
    t = json.load(open(sys.argv[1]))
    sig = json.load(open(sys.argv[2]))
    json.dump(apply(t, sig), open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
