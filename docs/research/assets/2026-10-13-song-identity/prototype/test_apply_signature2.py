"""Safety checks for apply_signature2.py: python3 test_apply_signature2.py (from any folder).

The six benchmark treatments are fixed test data in fixtures/ next to this file (the latest run of each song, copied
2026-10-13); the round-trip test fails when any of them is missing.
"""
import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from apply_signature2 import apply, strip  # noqa: E402

FIXTURES = ['sou-setsu-kon', 'platonic-choroin', 'tenmon-taiwa', 'sekai-no-tsuzuki', 'utsusemi', 'kousei']

SIGS = {
    'sea': {'scene': 'sea', 'horizon': 0.5, 'chorusHorizon': 0.62, 'picture': 'band', 'chorusPicture': 'band', 'font': 'Zen Old Mincho'},
    'space': {'scene': 'space', 'horizon': 0.6, 'chorusHorizon': 0.6, 'picture': 'keep', 'chorusPicture': 'keep'},
    'round': {'picture': 'circle', 'chorusPicture': 'circle', 'layout': 'round'},
    'bank': {'scene': 'riverbank', 'horizon': 0.38, 'chorusHorizon': 0.3, 'picture': 'band', 'chorusPicture': 'full', 'layout': 'linear', 'ink': '#3A57A8', 'font': 'Zen Kaku Gothic New'},
}


def section(*layers, start=0):
    return {'start': start, 'layers': list(layers)}


def treatment(*sections, moments=()):
    return {'design': {'font': 'M PLUS Rounded 1c'}, 'moments': list(moments), 'arc': [], 'graphics': {'sections': list(sections)}}


PAPER = {'kind': 'paper', 'color': '#F5EFE4'}
SKY = {'kind': 'bands', 'colors': ['#111111', '#333333', '#555555'], 'from': 0, 'to': 0.6}
HILLS = {'kind': 'skyline', 'type': 'hills', 'colors': ['#222222', '#111111']}
MOON = {'kind': 'blob', 'x': 0.7, 'y': 0.4, 'r': 0.06, 'color': '#FFF1C2'}
RINGS = {'kind': 'rings', 'x': 0, 'y': 0, 'color': '#FFFFFF'}
PHOTO = {'kind': 'photo', 'mode': 'circle', 'asset': 'a1', 'x': 0.3, 'y': 0.2, 'r': 0.27}


class Safety(unittest.TestCase):
    def test_never_modifies_the_input_and_strips_back_to_it(self):
        t = treatment(section(PAPER, SKY, HILLS, MOON, PHOTO), section(PAPER, MOON, start=10), moments=[{'kind': 'drop', 'at': 10}])
        before = copy.deepcopy(t)
        for sig in SIGS.values():
            out = apply(t, sig)
            self.assertEqual(t, before)
            self.assertEqual(strip(out), before)

    def test_applying_twice_equals_applying_once(self):
        t = treatment(section(PAPER, SKY, HILLS, PHOTO), section(PAPER, SKY, PHOTO, start=10), moments=[{'kind': 'drop', 'at': 10}])
        for sig in SIGS.values():
            once = apply(t, sig)
            self.assertEqual(apply(once, sig), once)

    def test_keep_leaves_photos_untouched(self):
        t = treatment(section(PAPER, SKY, PHOTO))
        out = apply(t, SIGS['space'])
        self.assertIn(PHOTO, out['graphics']['sections'][0]['layers'])

    def test_the_directors_own_objects_stay(self):
        t = treatment(section(PAPER, SKY, HILLS, MOON, RINGS))
        layers = apply(t, SIGS['space'])['graphics']['sections'][0]['layers']
        self.assertIn(MOON, layers)
        self.assertIn(RINGS, layers)
        # only the skeleton went: the sky bands and the ground silhouette
        self.assertNotIn(HILLS, layers)
        self.assertNotIn(SKY, layers)

    def test_a_section_without_a_sky_keeps_its_ground(self):
        t = treatment(section(PAPER, HILLS, MOON))
        layers = apply(t, SIGS['sea'])['graphics']['sections'][0]['layers']
        self.assertEqual([l for l in layers if not l.get('sig')], [PAPER, HILLS, MOON])

    def test_a_drop_at_the_next_section_start_lifts_that_section_not_this_one(self):
        t = treatment(section(PAPER, SKY, {'kind': 'blob', 'x': 0.6, 'y': 0.5, 'r': 0.12, 'color': '#E8553A'}),
                      section(PAPER, SKY, {'kind': 'blob', 'x': 0.6, 'y': 0.5, 'r': 0.12, 'color': '#E8553A'}, start=53.6),
                      moments=[{'kind': 'drop', 'at': 53.59}])
        a, b = apply(t, SIGS['sea'])['graphics']['sections']
        sun = lambda s: next(l for l in s['layers'] if l['kind'] == 'blob')
        self.assertEqual(sun(a)['r'], 0.12)  # the verse keeps its own small sun
        self.assertEqual(sun(b)['r'], 0.3)  # the chorus sun rises on the horizon

    def test_the_planet_is_ground(self):
        layers = apply(treatment(section(PAPER, SKY)), SIGS['space'])['graphics']['sections'][0]['layers']
        self.assertTrue(next(l for l in layers if l['kind'] == 'blob')['fixed'])

    def test_the_six_benchmark_treatments_round_trip(self):
        files = [HERE / 'fixtures' / f'{name}.json' for name in FIXTURES]
        missing = [f.name for f in files if not f.is_file()]
        self.assertEqual(missing, [], 'fixtures missing')
        for f in files:
            t = json.loads(f.read_text())
            self.assertGreaterEqual(len(t['graphics']['sections']), 3, f.name)
            for sig in SIGS.values():
                self.assertEqual(strip(apply(t, sig)), t, f.name)


if __name__ == '__main__':
    unittest.main()
