"""PuraEvents logo: a "P" monogram whose bowl is a countdown ring, on the
app's violet (#6558D9, see src/theme/tokens.ts).

Usage (from apps/mobile): python3 scripts/make_logo.py assets
then copy assets/icon.png over targets/widget/Assets.xcassets/app-icon.imageset/
app-icon.png and delete assets/logo-preview.png (a review sheet only).

The earlier calendar + countdown-ring icon is kept in make_logo_calendar.py.
Everything is drawn at 4x and downsampled for clean anti-aliased edges.
"""
import math
import sys

from PIL import Image, ImageDraw

SS = 4
TOP, BOTTOM = (128, 115, 236), (79, 64, 201)
WHITE = (255, 255, 255, 255)
# The part of the countdown ring still "to go": a deeper violet, so the
# white progress arc reads as a countdown rather than a closed circle.
TRACK = (40, 28, 140, 150)


def gradient(size):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,)
        for x in range(size):
            px[x, y] = c
    return img


def draw_mark(size, scale=1.0, mono=False):
    """The P mark on a transparent canvas. Designed on a 1024 grid around
    the centre; `scale` shrinks it into an adaptive icon's safe zone."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = S / 1024 * scale

    def P(x, y):
        return S / 2 + x * k, S / 2 + y * k

    def arc(cx, cy, r, w, start, sweep, fill):
        d.arc([*P(cx - r, cy - r), *P(cx + r, cy + r)], start=start, end=start + sweep, fill=fill, width=round(w * k))
        for ang in (start, start + sweep):
            a = math.radians(ang)
            ex, ey = cx + (r - w / 2) * math.cos(a), cy + (r - w / 2) * math.sin(a)
            d.ellipse([*P(ex - w / 2, ey - w / 2), *P(ex + w / 2, ey + w / 2)], fill=fill)

    w = 104
    cx, cy, r = -10, -100, 215
    # Remaining-time track (left out of the monochrome icon: one colour only).
    if not mono:
        arc(cx, cy, r, w, 0, 360, TRACK)
    # Stem, progress arc (3/4) and the dot at the bowl's centre.
    d.rounded_rectangle([*P(-230, -300), *P(-230 + w, 320)], radius=w / 2 * k, fill=WHITE)
    arc(cx, cy, r, w, -90, 270, WHITE)
    d.ellipse([*P(cx - 46, cy - 46), *P(cx + 46, cy + 46)], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def full_icon(size):
    icon = gradient(size)
    icon.alpha_composite(draw_mark(size))
    return icon.convert('RGB')


def main(out):
    full_icon(1024).save(f'{out}/icon.png')
    # Android adaptive icon: mark inside the ~66% safe zone on a violet layer.
    draw_mark(1024, scale=0.72).save(f'{out}/android-icon-foreground.png')
    gradient(1024).convert('RGB').save(f'{out}/android-icon-background.png')
    draw_mark(432, scale=0.72, mono=True).save(f'{out}/android-icon-monochrome.png')
    draw_mark(1024, scale=0.9).save(f'{out}/splash-icon.png')
    full_icon(48).save(f'{out}/favicon.png')

    # Review sheet: full icon, rounded/circle masks, adaptive, small sizes.
    sheet = Image.new('RGB', (1500, 600), (245, 245, 247))
    sheet.paste(full_icon(512), (40, 44))
    for i, rad in enumerate((50, 110)):
        m = Image.new('L', (220, 220), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, 219, 219], radius=rad, fill=255)
        sheet.paste(full_icon(220), (600 + i * 260, 60), m)
    adaptive = gradient(220)
    adaptive.alpha_composite(draw_mark(220, scale=0.72))
    m = Image.new('L', (220, 220), 0)
    ImageDraw.Draw(m).ellipse([0, 0, 219, 219], fill=255)
    sheet.paste(adaptive.convert('RGB'), (1120, 60), m)
    for i, sz in enumerate((120, 72, 48)):
        sheet.paste(full_icon(sz), (600 + i * 170, 380))
    mono = draw_mark(120, scale=0.72, mono=True)
    dark = Image.new('RGB', (120, 120), (30, 30, 40))
    dark.paste(mono, (0, 0), mono)
    sheet.paste(dark, (1120, 380))
    sheet.save(f'{out}/logo-preview.png')


if __name__ == '__main__':
    main(sys.argv[1])
