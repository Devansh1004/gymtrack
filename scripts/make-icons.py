"""Generates the PWA icons (a bumper plate) into public/. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
BLUE = '#1b57e8'


def plate(size, bg=True, maskable=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        if maskable:
            d.rectangle([0, 0, S, S], fill=BLUE)
        else:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BLUE)
    c = S / 2
    R = S * (0.30 if maskable else 0.37)
    hole = BLUE if bg else (0, 0, 0, 0)
    d.ellipse([c - R, c - R, c + R, c + R], fill='white')
    r2 = R * 0.80
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=hole)
    r3 = R * 0.62
    d.ellipse([c - r3, c - r3, c + r3, c + r3], fill='white')
    r4 = R * 0.18
    d.ellipse([c - r4, c - r4, c + r4, c + r4], fill=hole)
    return im.resize((size, size), Image.LANCZOS)


plate(192).save(os.path.join(OUT, 'icon-192.png'))
plate(512).save(os.path.join(OUT, 'icon-512.png'))
plate(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
plate(180).save(os.path.join(OUT, 'apple-touch-icon.png'))
plate(64).save(os.path.join(OUT, 'favicon.png'))
plate(96, bg=False).save(os.path.join(OUT, 'badge.png'))
print('icons written to', os.path.abspath(OUT))
