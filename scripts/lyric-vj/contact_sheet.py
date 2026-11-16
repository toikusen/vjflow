"""Labelled contact sheet: a grid of pictures, each with a letter and one line of text under it (CJK-safe).

uv run --with pillow python scripts/lyric-vj/contact_sheet.py items.json out.jpg [--cols 2] [--width 900]
items.json: [{"file": "A.jpg", "label": "A", "text": "one line"}, ...]
"""

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont

FONTS = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("items")
    p.add_argument("out")
    p.add_argument("--cols", type=int, default=2)
    p.add_argument("--width", type=int, default=900, help="width of one picture in the grid")
    a = p.parse_args()
    items = json.load(open(a.items))
    w = a.width
    gap, strip = 24, 92
    rows = (len(items) + a.cols - 1) // a.cols
    pics = [Image.open(x["file"]).convert("RGB") for x in items]
    h = max(round(w * im.height / im.width) for im in pics)
    sheet = Image.new("RGB", (a.cols * w + (a.cols + 1) * gap, rows * (h + strip + gap) + gap), "#F5EFE4")
    d = ImageDraw.Draw(sheet)
    big, small = font(44), font(28)
    for i, (x, im) in enumerate(zip(items, pics)):
        c, r = i % a.cols, i // a.cols
        ox, oy = gap + c * (w + gap), gap + r * (h + strip + gap)
        im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
        sheet.paste(im, (ox, oy))
        d.text((ox, oy + h + 10), x["label"], fill="#1A3E8C", font=big)
        d.text((ox + 70, oy + h + 22), x["text"], fill="#222222", font=small)
    sheet.save(a.out, quality=90)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
