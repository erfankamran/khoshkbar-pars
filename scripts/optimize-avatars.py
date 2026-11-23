# -*- coding: utf-8 -*-
"""Create optimized web copies of the 8 nut-mascot avatars for the storefront.

512x512 WebP with preserved circular transparency — small enough for
avatar-size UI (40–64px circles) while retina-sharp. Output: public/avatars/.
"""
import os
from PIL import Image

SRC = '/home/z/my-project/download/profile-avatars'
OUT = '/home/z/my-project/public/avatars'
FILES = ['almond', 'walnut', 'pistachio', 'hazelnut', 'cashew', 'peanut', 'raisin', 'mulberry']

os.makedirs(OUT, exist_ok=True)

total = 0
for name in FILES:
    src = os.path.join(SRC, f'{name}-avatar.png')
    img = Image.open(src).convert('RGBA').resize((512, 512), Image.LANCZOS)
    dst = os.path.join(OUT, f'{name}.webp')
    img.save(dst, 'WEBP', quality=88, method=6)
    size = os.path.getsize(dst)
    total += size
    print(f'{name}.webp  {size//1024} KB')

print(f'TOTAL: {total//1024} KB for {len(FILES)} avatars')
