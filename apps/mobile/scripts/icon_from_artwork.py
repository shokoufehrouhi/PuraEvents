"""Builds every app icon asset from a finished, square artwork image whose
icon sits on a white page with baked-in rounded corners (e.g. a designer
export like logo2.png).

Usage (from apps/mobile):
    python3 scripts/icon_from_artwork.py path/to/artwork.png assets
then copy assets/icon.png over targets/widget/Assets.xcassets/app-icon.imageset/
app-icon.png and delete assets/logo-preview.png (a review sheet only).

Steps: crop to the icon, paint the white corners with the neighbouring
background colour (icon.png must be full-bleed: iOS and the stores apply
their own mask), then derive the Android adaptive layers — the rounded
violet badge centred on a white backdrop — and a monochrome silhouette.
"""
import sys

from PIL import Image, ImageDraw, ImageFilter


def is_white(rgb):
    # Near-white page, not the icon's own pale highlights (which stay
    # tinted violet, i.e. blue well above red/green).
    r, g, b = rgb[:3]
    return r > 215 and g > 215 and b > 215 and b - r < 25


def crop_to_icon(img):
    w, h = img.size
    px = img.load()
    xs = [x for x in range(w) if any(not is_white(px[x, y]) for y in range(0, h, 4))]
    ys = [y for y in range(h) if any(not is_white(px[x, y]) for x in range(0, w, 4))]
    # A few pixels inside the detected edge: the straight sides carry an
    # anti-aliased fringe that would otherwise show as a pale line.
    inset = 6
    side = max(xs[-1] - xs[0], ys[-1] - ys[0]) + 1 - 2 * inset
    cx, cy = (xs[0] + xs[-1]) // 2, (ys[0] + ys[-1]) // 2
    return img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))


def fill_corners(img):
    """Replace the white outside the rounded corners with the nearest inside
    colour, sampled a few pixels in to skip the anti-aliased edge."""
    img = img.copy()
    w, h = img.size
    px = img.load()
    zone = w // 3  # corners only; the art itself never touches white here
    for y in range(h):
        if zone <= y < h - zone:
            continue
        # from the left
        x = 0
        while x < zone and is_white(px[x, y]):
            x += 1
        if 0 < x < zone:
            src = px[min(x + 8, w - 1), y]
            for i in range(x + 4):
                px[i, y] = src
        # from the right
        x = w - 1
        while x > w - 1 - zone and is_white(px[x, y]):
            x -= 1
        if w - 1 - zone < x < w - 1:
            src = px[max(x - 8, 0), y]
            for i in range(x - 3, w):
                px[i, y] = src
    # Rows that were white end to end (the very top/bottom, above/below the
    # curve's start) copy the nearest filled row.
    for y in range(h):
        if all(is_white(px[x, y]) for x in range(0, w, 16)):
            ref = y + 1 if y < h // 2 else y - 1
            while 0 <= ref < h and all(is_white(px[x, ref]) for x in range(0, w, 16)):
                ref += 1 if y < h // 2 else -1
            for x in range(w):
                px[x, y] = px[x, ref]
    # Soften the seams the fill leaves behind.
    blurred = img.filter(ImageFilter.GaussianBlur(w / 120))
    mask = Image.new('L', (w, h), 0)
    r = int(w * 0.24)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    edge = mask.filter(ImageFilter.GaussianBlur(w / 60))
    return Image.composite(img, blurred, edge)


def adaptive_layers(full, size=1024):
    """Android launcher icon in the style of Google's own: a white backdrop
    (the launcher's circle/squircle) with the violet rounded-square icon
    sitting in the middle of it, like Maps or Play Store."""
    bg = Image.new('RGB', (size, size), (255, 255, 255))
    # Launchers show the middle 72 of the 108dp layer; the badge takes a
    # bit over half of that visible area.
    inner = int(size * 0.40)
    badge = full.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (inner * 4, inner * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, inner * 4 - 1, inner * 4 - 1], radius=int(inner * 4 * 0.24), fill=255)
    badge.putalpha(m.resize((inner, inner), Image.LANCZOS))
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # Soft shadow under the badge.
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o = (size - inner) // 2
    ImageDraw.Draw(sh).rounded_rectangle([o, o + size * 0.012, o + inner, o + inner + size * 0.012], radius=int(inner * 0.24), fill=(60, 40, 160, 70))
    fg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size / 90)))
    fg.alpha_composite(badge, (o, o))
    return fg, bg


def rounded_badge(full, size, shadow=False):
    """The icon as a rounded square on transparent — for the splash screen
    and in-app use (About, share card), where nothing masks it for us."""
    pad = int(size * 0.06) if shadow else 0
    inner = size - 2 * pad
    badge = full.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (inner * 4, inner * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, inner * 4 - 1, inner * 4 - 1], radius=int(inner * 4 * 0.24), fill=255)
    badge.putalpha(m.resize((inner, inner), Image.LANCZOS))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([pad, pad + size * 0.02, pad + inner, pad + inner + size * 0.02], radius=int(inner * 0.24), fill=(60, 40, 160, 80))
        out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size / 40)))
    out.alpha_composite(badge, (pad, pad))
    return out


def monochrome(full, size=432):
    """The light, glassy shapes as a white silhouette on transparent."""
    small = full.resize((size, size), Image.LANCZOS).convert('L')
    alpha = small.point(lambda v: 0 if v < 190 else min(255, (v - 190) * 5))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    inner = int(size * 0.52)
    alpha = alpha.resize((inner, inner), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    white = Image.new('RGBA', (inner, inner), (255, 255, 255, 255))
    white.putalpha(alpha)
    out.alpha_composite(white, ((size - inner) // 2, (size - inner) // 2))
    return out


def main(src, out):
    full = fill_corners(crop_to_icon(Image.open(src).convert('RGB')))
    full = full.resize((1024, 1024), Image.LANCZOS)
    full.save(f'{out}/icon.png')
    fg, bg = adaptive_layers(full)
    fg.save(f'{out}/android-icon-foreground.png')
    bg.save(f'{out}/android-icon-background.png')
    monochrome(full).save(f'{out}/android-icon-monochrome.png')
    rounded_badge(full, 1024, shadow=True).save(f'{out}/splash-icon.png')
    # Small copy for in-app use (About screen, share card wordmark).
    rounded_badge(full, 256).save(f'{out}/images/app-logo.png')
    full.resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.png')

    # Review sheet: full icon, squircle/circle masks, adaptive, small, mono.
    sheet = Image.new('RGB', (1500, 600), (245, 245, 247))
    sheet.paste(full.resize((512, 512), Image.LANCZOS), (40, 44))
    for i, rad in enumerate((50, 110)):
        m = Image.new('L', (220, 220), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, 219, 219], radius=rad, fill=255)
        sheet.paste(full.resize((220, 220), Image.LANCZOS), (600 + i * 260, 60), m)
    ad = bg.resize((220, 220), Image.LANCZOS).convert('RGBA')
    ad.alpha_composite(fg.resize((220, 220), Image.LANCZOS))
    # Launchers show the middle 72 of the 108dp layer.
    crop = int(220 * 18 / 108)
    ad = ad.crop((crop, crop, 220 - crop, 220 - crop)).resize((220, 220), Image.LANCZOS)
    m = Image.new('L', (220, 220), 0)
    ImageDraw.Draw(m).ellipse([0, 0, 219, 219], fill=255)
    sheet.paste(ad.convert('RGB'), (1120, 60), m)
    for i, sz in enumerate((120, 72, 48)):
        sheet.paste(full.resize((sz, sz), Image.LANCZOS), (600 + i * 170, 380))
    mono = monochrome(full, 120)
    dark = Image.new('RGB', (120, 120), (30, 30, 40))
    dark.paste(mono, (0, 0), mono)
    sheet.paste(dark, (1120, 380))
    sheet.save(f'{out}/logo-preview.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
