"""uv run --with numpy --with pillow --with scipy python scripts/lyric-vj/test_key_screen.py"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from key_frames import key_one  # noqa: E402
from key_screen import SCREENS, despill, screen_alpha, screen_excess  # noqa: E402

HEX = {"green": (0x00, 0xB1, 0x40), "blue": (0x00, 0x47, 0xBB), "magenta": (0xE0, 0x21, 0x8A)}
PINE = [(0x16, 0x33, 0x3A), (0xDF, 0xE9, 0xE2), (0xB5, 0x50, 0x2F), (0x3B, 0x6B, 0x76)]
CAR_GREEN = (0x2E, 0x8B, 0x57)  # the green the image model painted Tokyo Drift's car body in


def picture(screen, fill):
    im = np.zeros((60, 60, 3), np.int16)
    im[:] = HEX[screen]
    im[20:40, 20:40] = fill
    return im


def channels(im):
    return im[..., 0], im[..., 1], im[..., 2]


def test_each_screen_keys_its_own_colour():
    for s in SCREENS:
        alpha, _ = screen_alpha(*channels(picture(s, (40, 40, 40))), s)
        assert alpha[0, 0] == 0, s
        assert alpha[30, 30] == 1, s


def test_palette_inks_stay_opaque_on_magenta():
    for ink in PINE + [CAR_GREEN]:
        alpha, _ = screen_alpha(*channels(picture("magenta", ink)), "magenta")
        assert alpha[30, 30] == 1, ink


def test_green_screen_eats_a_green_car():
    alpha, _ = screen_alpha(*channels(picture("green", CAR_GREEN)), "green")
    assert alpha[30, 30] < 1


def lean_after(px, screen):
    im = np.array([[px]], np.int16)
    r, g, b = channels(im)
    _, lean = screen_alpha(r, g, b, screen)
    out = despill(im, np.ones(r.shape, bool), lean, screen)
    o = out[0, 0].astype(int)
    return o, screen_excess(o[0], o[1], o[2], screen)


def test_white_breath_over_green_despills_to_neutral_not_teal():
    # 35 % green screen over white: the old rule (green lowered to max(r, b)) left it teal, blue well over red
    px = [int(0.65 * 255 + 0.35 * c) for c in HEX["green"]]
    o, lean = lean_after(px, "green")
    assert lean <= 2 and abs(int(o[2]) - int(o[0])) <= 6, o


def test_each_screen_despills_its_lean():
    for s in SCREENS:
        px = [int(0.7 * 128 + 0.3 * c) for c in HEX[s]]
        o, lean = lean_after(px, s)
        assert lean <= 2, (s, o)


def test_despill_never_overshoots_into_the_opposite_tint():
    # a figure's rim mixed 10-60 % with the screen, over several figure colours: the result leans neither way
    for scr in SCREENS:
        for fg in [(255, 255, 255), (40, 40, 40), (200, 120, 90), (90, 120, 200)]:
            for k in (0.1, 0.3, 0.6):
                px = [int((1 - k) * f + k * c) for f, c in zip(fg, HEX[scr])]
                o, lean = lean_after(px, scr)
                if screen_excess(*px, scr) > 0 and screen_excess(*fg, scr) <= 0:
                    assert -4 <= lean <= 2, (scr, fg, k, o, lean)


def test_inks_without_lean_are_untouched():
    for ink in PINE:
        o, _ = lean_after(list(ink), "magenta")
        assert tuple(o) == ink, (ink, o)


def test_clip_frames_key_on_magenta():
    rgb, a, box = key_one(picture("magenta", CAR_GREEN).astype(np.uint8), "magenta")
    assert box == (20, 20, 40, 40)
    assert a[30, 30] == 1 and a[0, 0] == 0


def test_black_inside_a_figure_is_not_a_pillarbox():
    im = picture("green", (200, 200, 200))
    im[:, :6] = 0
    im[25:35, 25:35] = (5, 5, 5)
    _, a, box = key_one(im.astype(np.uint8), "green")
    assert a[30, 30] == 1 and a[30, 2] == 0


def test_two_people_with_a_gap_stay_one_sprite():
    import json
    import subprocess
    import tempfile

    from PIL import Image

    im = np.zeros((200, 400, 3), np.uint8)
    im[:] = HEX["green"]
    im[40:180, 60:140] = (40, 40, 40)
    im[50:180, 260:330] = (200, 200, 200)
    d = tempfile.mkdtemp()
    Image.fromarray(im).save(os.path.join(d, "two.png"))
    run = lambda out, *extra: subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "key_sprites.py"), os.path.join(d, "two.png"), os.path.join(d, out), "--min", "0.02", *extra], check=True, capture_output=True)
    run("apart")
    run("merged", "--merge")
    apart = json.load(open(os.path.join(d, "apart", "frames.json")))["frames"]
    merged = json.load(open(os.path.join(d, "merged", "frames.json")))["frames"]
    assert len(apart) == 2 and len(merged) == 1
    assert merged[0]["w"] >= 270, merged


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
