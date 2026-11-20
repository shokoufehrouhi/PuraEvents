"""Google Play listing graphics from the app artwork.

Usage (from apps/mobile): python3 scripts/make_store_graphics.py
Writes assets/store/play-icon-512.png (full-bleed, Play applies its own
mask) and assets/store/feature-graphic-1024x500.png (violet gradient,
glass glyph, wordmark). The wordmark is the brand name, never translated.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def main():
    icon = Image.open('assets/icon.png').convert('RGBA')
    icon.resize((512, 512), Image.LANCZOS).save('assets/store/play-icon-512.png')

    w, h = 1024, 500
    bg = Image.open('assets/android-icon-background.png').convert('RGB')
    top = (bg.height - h) // 2
    banner = bg.crop((0, top, w, top + h)).convert('RGBA')

    # Glyph = the icon's near-white shapes. The green channel keeps the pale
    # violet highlight in the icon's top-left corner out of the mask.
    green = icon.split()[1]
    mask = green.point(lambda v: 0 if v < 150 else min(255, (v - 150) * 4))
    # The artwork's outer pixels carry a pale anti-aliased fringe; drop it.
    m = icon.width // 25
    ImageDraw.Draw(mask).rectangle([0, 0, icon.width - 1, icon.height - 1], outline=0, width=m)
    mask = mask.filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(8))
    glyph = icon.copy()
    glyph.putalpha(mask)
    glyph = glyph.crop(glyph.getbbox())
    gh = 300
    glyph = glyph.resize((int(glyph.width * gh / glyph.height), gh), Image.LANCZOS)
    gx, gy = 70, (h - gh) // 2
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    shadow.paste((40, 20, 140, 120), (gx, gy + 10), glyph.split()[3])
    banner.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    banner.alpha_composite(glyph, (gx, gy))

    font = ImageFont.truetype(FONT, 96)
    draw = ImageDraw.Draw(banner)
    tx = gx + glyph.width + 50
    bbox = draw.textbbox((0, 0), 'PuraEvents', font=font)
    ty = (h - (bbox[3] - bbox[1])) // 2 - bbox[1]
    draw.text((tx + 3, ty + 4), 'PuraEvents', font=font, fill=(40, 20, 140, 90))
    draw.text((tx, ty), 'PuraEvents', font=font, fill=(255, 255, 255, 255))
    banner.convert('RGB').save('assets/store/feature-graphic-1024x500.png')


if __name__ == '__main__':
    main()
