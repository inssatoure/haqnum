#!/usr/bin/env bash
# Génère les fichiers de test : Dictaphone (.m4a), vidéo (.mov), photo EXIF+GPS, QR vCard (caméra simulée).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fixtures
cd fixtures
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=20" -metadata creation_time=2026-10-29T09:30:00Z -c:a aac -b:a 64k dictaphone.m4a
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=4:size=640x360:rate=25 -f lavfi -i "sine=frequency=300:duration=4" \
  -metadata creation_time=2026-10-31T15:30:00Z -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest video.mov
python3 - <<'EOF'
from PIL import Image, ImageDraw
im = Image.new('RGB', (1200, 800), (40, 60, 90))
ImageDraw.Draw(im).rectangle([100, 100, 1100, 700], outline=(220, 150, 60), width=12)
ex = Image.Exif()
ex[0x0110] = 'iPhone 15'
ex[0x8769] = {0x9003: '2026:10:31 10:30:00', 0x9011: '+01:00'}
ex[0x8825] = {1: 'N', 2: (43.0, 18.0, 37.8), 3: 'E', 4: (5.0, 23.0, 26.2)}
im.save('photo.jpg', exif=ex.tobytes())
EOF
node -e "
const QR=require('qrcode');
const v='BEGIN:VCARD\r\nVERSION:3.0\r\nN:Bouchard;Paul;;;\r\nFN:Paul Bouchard\r\nORG:Diversion\r\nTITLE:Fonds européens\r\nEMAIL:paul@diversion.example\r\nTEL:+33600000000\r\nEND:VCARD';
QR.toFile('qr.png', v, {width:480, margin:4}, e=>{ if(e) throw e; });
"
ffmpeg -y -loglevel error -loop 1 -i qr.png -vf "pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p" -t 3 -r 10 qr.y4m
echo "fixtures ok"
