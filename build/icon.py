"""
Draws the application icon.

Kept beside the icon it produces so the thing can be changed rather than
redrawn: the colours are named, the headstock is one function, and the ground
it sits on is another. Nothing here ships — `build/` is a build resource, and
the app itself is only `out/`.

    python3 build/icon.py

A 3+3 headstock, because a guitar is what the app is for and the silhouette
survives being shrunk to a dock icon. Deep water behind it, lit from the
middle, so it can be told apart from its neighbours at a glance even once the
detail has gone.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
CORNER = 0.22

DEEP = (16, 38, 74)
ABYSS = (7, 10, 18)
LAMP = (99, 179, 237)
GO = (111, 217, 154)
GO_LO = (67, 171, 109)
STEEL = (198, 203, 212)
WOOD_HI = (78, 84, 96)
WOOD_LO = (44, 48, 56)

TOP, BOTTOM = SIZE * 0.16, SIZE * 0.80
HALF_TOP, HALF_NUT = SIZE * 0.185, SIZE * 0.115
CX = SIZE / 2


def corners() -> Image.Image:
    """The rounded square everything is kept inside."""
    m = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1],
                                        radius=int(SIZE * CORNER), fill=255)
    return m


def vertical(top: tuple, bottom: tuple) -> Image.Image:
    ramp = Image.new('RGB', (1, SIZE))
    pixels = ramp.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        pixels[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return ramp.resize((SIZE, SIZE))


def ground() -> Image.Image:
    """Deep water, with a light in it."""
    im = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    im.paste(vertical(DEEP, ABYSS), (0, 0), corners())

    radius = SIZE * 0.36
    lamp = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(lamp).ellipse([CX - radius, SIZE * 0.52 - radius,
                                  CX + radius, SIZE * 0.52 + radius],
                                 fill=LAMP + (120,))
    lamp = lamp.filter(ImageFilter.GaussianBlur(radius * 0.55))
    lamp.putalpha(Image.composite(lamp.split()[3], Image.new('L', (SIZE, SIZE), 0), corners()))
    im.alpha_composite(lamp)
    return im


def paddle() -> list:
    """Wide at the crown, narrowing to the nut."""
    waist = TOP + (BOTTOM - TOP) * 0.62
    shoulder = TOP + (BOTTOM - TOP) * 0.16
    return [(CX - HALF_TOP * 0.72, TOP),
            (CX + HALF_TOP * 0.72, TOP),
            (CX + HALF_TOP, shoulder),
            (CX + HALF_NUT * 1.10, waist),
            (CX + HALF_NUT, BOTTOM),
            (CX - HALF_NUT, BOTTOM),
            (CX - HALF_NUT * 1.10, waist),
            (CX - HALF_TOP, shoulder)]


def headstock(im: Image.Image) -> Image.Image:
    face = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(face).polygon(paddle(), fill=255)
    im.paste(vertical(WOOD_HI, WOOD_LO), (0, 0), face)

    d = ImageDraw.Draw(im)
    d.line(paddle() + [paddle()[0]], fill=STEEL, width=10, joint='curve')

    posts = {-1: [], 1: []}
    for side in (-1, 1):
        for row in range(3):
            along = 0.17 + row * 0.235
            y = TOP + (BOTTOM - TOP) * along
            edge = HALF_TOP + (HALF_NUT - HALF_TOP) * max(0.0, (along - 0.16) / 0.84) * 0.55
            x = CX + side * (edge + SIZE * 0.052)
            d.line([(CX + side * edge * 0.88, y), (x, y)], fill=GO_LO, width=int(SIZE * 0.022))
            r = SIZE * 0.042
            d.ellipse([x - r, y - r, x + r, y + r], fill=GO)
            # The post stands through the face inboard of the edge. The button
            # on the outside is only what you turn, so a string drawn out to it
            # has gone past the wood.
            posts[side].append((CX + side * edge * 0.62, y))

    # The slot nearest the edge of the nut takes the nearest post and the one
    # nearest the middle takes the farthest, which is the order that keeps six
    # strings from crossing on the way up.
    wound = list(reversed(posts[-1])) + posts[1]
    half = HALF_NUT * 0.84
    for i, (px, py) in enumerate(wound):
        x = CX - half + (i + 0.5) * (half * 2 / 6)
        d.line([(x, BOTTOM - SIZE * 0.03), (px, py)], fill=GO, width=8)

    d.rounded_rectangle([CX - HALF_NUT * 1.16, BOTTOM - SIZE * 0.030,
                         CX + HALF_NUT * 1.16, BOTTOM + SIZE * 0.022],
                        radius=int(SIZE * 0.012), fill=STEEL)
    return im


if __name__ == '__main__':
    at = Path(__file__).with_name('icon.png')
    headstock(ground()).save(at)
    print(f'wrote {at} ({SIZE}x{SIZE})')
