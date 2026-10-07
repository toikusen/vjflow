"""Builds a song's sprite library from keyed frame folders (key_sprites.py): a manifest the renderer loads as assets
(id → image), library.json for the director (id, size, what it is) and a labelled contact sheet it can look at.

uv run --with pillow python scripts/lyric-vj/sprite_library.py names.json out_dir
names.json: {"<folder with f00.png…>": {"<frame index>": ["<id>", "<what it is>"], …}, …} — frames left out are dropped
"""

import json
import os
import shutil
import sys

from PIL import Image, ImageDraw


def main():
    names, out = json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2]
    os.makedirs(out, exist_ok=True)
    lib, manifest, thumbs = [], {}, []
    for folder, frames in names.items():
        for idx, (sid, what) in frames.items():
            src = os.path.join(folder, f"f{int(idx):02d}.png")
            dst = os.path.join(out, f"{sid}.png")
            shutil.copyfile(src, dst)
            im = Image.open(dst)
            lib.append({"id": sid, "w": im.width, "h": im.height, "what": what})
            manifest[f"spr:{sid}"] = {"kind": "image", "url": os.path.abspath(dst)}
            thumbs.append((sid, im))
    json.dump({"sprites": lib}, open(os.path.join(out, "library.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(manifest, open(os.path.join(out, "assets.json"), "w"), indent=1)
    # contact sheet: 8 per row, each on the ground colour with its id under it
    cell, cols = 240, 8
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 28)), (240, 232, 220))
    d = ImageDraw.Draw(sheet)
    for k, (sid, im) in enumerate(thumbs):
        t = im.copy()
        t.thumbnail((cell - 16, cell - 16))
        x, y = (k % cols) * cell, (k // cols) * (cell + 28)
        sheet.paste(t, (x + (cell - t.width) // 2, y + cell - 8 - t.height), t)
        d.text((x + 8, y + cell + 4), sid, fill=(27, 27, 34))
    sheet.save(os.path.join(out, "contact.jpg"), quality=88)
    print(f"{len(lib)} sprites → {out}")


if __name__ == "__main__":
    main()
