"""Draws the extension icons: a calendar page with a "t" on a coral-pink tile.

Usage: python3 scripts/make-icons.py   (needs Pillow: pip install pillow,
and a bold rounded font; macOS ships Arial Rounded MT Bold)

The 16/32/48 toolbar icons use the whole canvas. The 128px icon follows the
Chrome Web Store guideline: 96x96 artwork centred with 16px transparent padding.
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = (237, 108, 110, 255)  # #ED6C6E
BAND = (253, 221, 221, 255)
WHITE = (255, 255, 255, 255)
SIZE = 1024
FONTS = [
    os.environ.get("ICON_FONT", ""),
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/Library/Fonts/Arial Rounded Bold.ttf",
]


def font(size):
    for path in FONTS:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("No bold rounded font found; set ICON_FONT=/path/to/font.ttf")


def artwork():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=230, fill=BRAND)
    # calendar page with a tinted header band
    d.rounded_rectangle([200, 250, 824, 840], radius=90, fill=WHITE)
    d.rounded_rectangle([200, 250, 824, 420], radius=90, fill=BAND)
    d.rectangle([200, 350, 824, 420], fill=BAND)
    # binder rings
    for cx in (360, 664):
        d.rounded_rectangle([cx - 38, 170, cx + 38, 330], radius=38, fill=WHITE)
        d.rounded_rectangle([cx - 20, 188, cx + 20, 312], radius=20, fill=BRAND)
    # the "t", centred in the page body
    f = font(470)
    left, top, right, bottom = d.textbbox((0, 0), "t", font=f)
    x = 512 - (right - left) / 2 - left
    y = 630 - (bottom - top) / 2 - top
    d.text((x, y), "t", font=f, fill=BRAND)
    return img


def main():
    master = artwork()
    out = ROOT / "extension" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for n in (16, 32, 48):
        master.resize((n, n), Image.LANCZOS).save(out / f"icon{n}.png")

    padded = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    padded.paste(master.resize((96, 96), Image.LANCZOS), (16, 16))
    padded.save(out / "icon128.png")
    padded.save(ROOT / "store" / "store-icon-128.png")
    # Unpadded art for the store screenshots and promo tiles.
    master.resize((256, 256), Image.LANCZOS).save(ROOT / "store" / "assets-src" / "icon-art.png")
    print("wrote extension/icons/icon{16,32,48,128}.png, store/store-icon-128.png, store/assets-src/icon-art.png")


if __name__ == "__main__":
    main()
