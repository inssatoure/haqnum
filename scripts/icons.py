# Génère les icônes (cercle ocre sur bleu nuit, lettre M en serif)
from PIL import Image, ImageDraw, ImageFont
import sys

out = sys.argv[1]
for size in (180, 192, 512):
    im = Image.new('RGB', (size, size), (7, 13, 24))
    d = ImageDraw.Draw(im)
    pad = size * 0.14
    d.ellipse([pad, pad, size - pad, size - pad], fill=(208, 138, 58))
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(size * 0.42))
    except Exception:
        f = ImageFont.load_default()
    d.text((size / 2, size / 2), 'M', fill=(7, 13, 24), font=f, anchor='mm')
    name = 'apple-touch-icon.png' if size == 180 else f'icon-{size}.png'
    im.save(f'{out}/{name}')
print('ok')
