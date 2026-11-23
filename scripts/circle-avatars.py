# -*- coding: utf-8 -*-
"""Crop raw square mascot images into circular PNGs with anti-aliased transparent
corners, then verify results and build a preview grid."""
import os
from PIL import Image, ImageDraw

RAW = '/home/z/my-project/scripts/avatar-raw'
OUT = '/home/z/my-project/download/profile-avatars'
FILES = ['almond', 'walnut', 'pistachio', 'hazelnut', 'cashew', 'peanut', 'raisin', 'mulberry']
SS = 4  # supersampling factor for smooth circular edge

os.makedirs(OUT, exist_ok=True)

for name in FILES:
    src = os.path.join(RAW, f'{name}.png')
    img = Image.open(src).convert('RGBA')
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

    # anti-aliased circular mask (supersampled then downscaled)
    mask = Image.new('L', (side * SS, side * SS), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, side * SS, side * SS), fill=255)
    mask = mask.resize((side, side), Image.LANCZOS)

    img.putalpha(mask)
    dst = os.path.join(OUT, f'{name}-avatar.png')
    img.save(dst, 'PNG')
    print(f'circled: {dst} ({os.path.getsize(dst)} bytes)')

# ---------- verification ----------
print('\n--- verification ---')
all_ok = True
for name in FILES:
    p = os.path.join(OUT, f'{name}-avatar.png')
    img = Image.open(p)
    img_rgba = img.convert('RGBA')
    w, h = img_rgba.size
    px = img_rgba.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    center = px[w // 2, h // 2]
    corners_transparent = all(c[3] == 0 for c in corners)
    center_opaque = center[3] == 255
    # non-blank check: variance of RGB in central region
    region = img_rgba.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4)).convert('RGB')
    colors = region.getcolors(maxcolors=1 << 24)
    n_colors = len(colors) if colors else 0
    ok = corners_transparent and center_opaque and n_colors > 200
    all_ok = all_ok and ok
    print(f'{name}: size={w}x{h} corners_alpha0={corners_transparent} '
          f'center_alpha255={center_opaque} colors={n_colors} -> {"OK" if ok else "FAIL"}')

# ---------- preview grid (4 x 2, no text) ----------
CELL = 480
PAD = 24
COLS, ROWS = 4, 2
sheet = Image.new('RGB', (COLS * CELL + PAD * (COLS + 1), ROWS * CELL + PAD * (ROWS + 1)), (250, 245, 238))
for i, name in enumerate(FILES):
    p = os.path.join(OUT, f'{name}-avatar.png')
    av = Image.open(p).convert('RGBA').resize((CELL, CELL), Image.LANCZOS)
    r, c = divmod(i, COLS)
    x = PAD + c * (CELL + PAD)
    y = PAD + r * (CELL + PAD)
    sheet.paste(av, (x, y), av)
preview_path = os.path.join(OUT, 'preview-all.png')
sheet.save(preview_path, 'PNG')
print(f'\npreview grid: {preview_path} ({os.path.getsize(preview_path)} bytes)')

print('\nRESULT:', 'ALL OK' if all_ok else 'SOME FAILED')
