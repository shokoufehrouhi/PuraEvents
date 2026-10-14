"""PuraEvents logo: a white calendar page with a countdown ring, on the app's violet.

Usage (from apps/mobile): python3 scripts/make_logo_calendar.py assets
then copy assets/icon.png over targets/widget/Assets.xcassets/app-icon.imageset/
app-icon.png and delete assets/logo-preview.png (a review sheet only).

Drawn at 4x and downsampled for clean anti-aliased edges. Produces a
preview plus every asset the Expo app config points at.
"""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor
# Accent colour (variable names kept from the first, red draft). RED is the
# app's primary #6558D9 — see src/theme/tokens.ts.
RED_TOP = (128, 115, 236)
RED_BOTTOM = (79, 64, 201)
RED = (101, 88, 217)
RED_TRACK = (223, 219, 250)
WHITE = (255, 255, 255)


def gradient(size, top, bottom):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        for x in range(size):
            px[x, y] = c
    return img


def draw_mark(size, scale=1.0, mono=False):
    """The calendar + countdown mark on a transparent canvas of `size`.

    Coordinates are designed on a 1024 grid around the centre and scaled by
    `scale` (adaptive icons need the mark inside the central safe zone).
    """
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = S / 1024 * scale
    cx = cy = S / 2

    def P(x, y):  # design coords (1024 grid, origin = centre) -> pixels
        return cx + x * k, cy + y * k

    page = WHITE + (255,)
    ring = (RED + (255,)) if not mono else (0, 0, 0, 0)
    track = (RED_TRACK + (255,)) if not mono else (0, 0, 0, 0)

    # Soft drop shadow under the page (colour icon only).
    if not mono:
        sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        x0, y0 = P(-250, -190)
        x1, y1 = P(250, 290)
        sd.rounded_rectangle([x0, y0 + 18 * k, x1, y1 + 18 * k], radius=96 * k, fill=(30, 18, 90, 110))
        sh = sh.filter(ImageFilter.GaussianBlur(28 * k))
        img.alpha_composite(sh)
        d = ImageDraw.Draw(img)

    # Calendar page.
    x0, y0 = P(-250, -190)
    x1, y1 = P(250, 290)
    d.rounded_rectangle([x0, y0, x1, y1], radius=96 * k, fill=page)

    # Header strip of the page, in red, with the two binding rings.
    hx0, hy0 = P(-250, -190)
    hx1, hy1 = P(250, -82)
    header = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(header)
    hd.rounded_rectangle([x0, y0, x1, y1], radius=96 * k, fill=(RED + (255,)) if not mono else (0, 0, 0, 0))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rectangle([hx0, hy0, hx1, hy1], fill=255)
    if mono:
        # Monochrome: punch the header out so it reads as a calendar top.
        cut = Image.new('L', (S, S), 255)
        ImageDraw.Draw(cut).rectangle([hx0, hy1 - 22 * k, hx1, hy1], fill=0)
        img.putalpha(Image.composite(img.getchannel('A'), Image.new('L', (S, S), 0), cut))
    else:
        img.paste(header, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # Binding rings poking out of the top.
    for bx in (-120, 120):
        rx0, ry0 = P(bx - 30, -250)
        rx1, ry1 = P(bx + 30, -126)
        d.rounded_rectangle([rx0, ry0, rx1, ry1], radius=30 * k, fill=page)

    # Countdown ring: light track + 3/4 progress arc with a round cap.
    r, w = 128, 40
    rcx, rcy = 0, 105
    bb = [*P(rcx - r, rcy - r), *P(rcx + r, rcy + r)]
    d.ellipse(bb, outline=track, width=round(w * k))
    start, sweep = -90, 270
    d.arc(bb, start=start, end=start + sweep, fill=ring, width=round(w * k))
    for ang in (start, start + sweep):
        a = math.radians(ang)
        ex, ey = rcx + (r - w / 2) * math.cos(a), rcy + (r - w / 2) * math.sin(a)
        ex0, ey0 = P(ex - w / 2, ey - w / 2)
        ex1, ey1 = P(ex + w / 2, ey + w / 2)
        d.ellipse([ex0, ey0, ex1, ey1], fill=ring)

    # Centre dot + hand pointing to 12 — the "moment" being counted down to.
    hx0, hy0 = P(rcx - 13, rcy - 62)
    hx1, hy1 = P(rcx + 13, rcy)
    d.rounded_rectangle([hx0, hy0, hx1, hy1], radius=13 * k, fill=ring)
    dx0, dy0 = P(rcx - 26, rcy - 26)
    dx1, dy1 = P(rcx + 26, rcy + 26)
    d.ellipse([dx0, dy0, dx1, dy1], fill=ring)

    return img.resize((size, size), Image.LANCZOS)


def full_icon(size):
    bg = gradient(size, RED_TOP, RED_BOTTOM).convert('RGBA')
    bg.alpha_composite(draw_mark(size, scale=1.0))
    return bg.convert('RGB')


def main(out):
    full_icon(1024).save(f'{out}/icon.png')
    # Android adaptive: mark scaled into the ~66% safe zone; red backdrop.
    draw_mark(1024, scale=0.72).save(f'{out}/android-icon-foreground.png')
    gradient(1024, RED_TOP, RED_BOTTOM).save(f'{out}/android-icon-background.png')
    draw_mark(432, scale=0.72, mono=True).save(f'{out}/android-icon-monochrome.png')
    # Splash: the mark alone on transparent (shown on a red background).
    draw_mark(1024, scale=0.9).save(f'{out}/splash-icon.png')
    full_icon(48).save(f'{out}/favicon.png')

    # Preview sheet: big icon, round + squircle masks, small sizes.
    big = full_icon(512)
    sheet = Image.new('RGB', (1500, 600), (245, 245, 247))
    sheet.paste(big, (40, 44))
    for i, (sz, rad) in enumerate([(220, 50), (220, 110)]):
        ic = full_icon(sz)
        m = Image.new('L', (sz, sz), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, sz - 1, sz - 1], radius=rad, fill=255)
        sheet.paste(ic, (600 + i * 260, 60), m)
    fg = Image.open(f'{out}/android-icon-foreground.png').resize((220, 220), Image.LANCZOS)
    ad = gradient(220, RED_TOP, RED_BOTTOM).convert('RGBA')
    ad.alpha_composite(fg)
    m = Image.new('L', (220, 220), 0)
    ImageDraw.Draw(m).ellipse([0, 0, 219, 219], fill=255)
    sheet.paste(ad.convert('RGB'), (1120, 60), m)
    for i, sz in enumerate([120, 72, 48]):
        sheet.paste(full_icon(sz), (600 + i * 170, 380))
    sheet.save(f'{out}/logo-preview.png')


if __name__ == '__main__':
    main(sys.argv[1])
