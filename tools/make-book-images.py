#!/usr/bin/env python3
"""「나의 이야기」 원본 그림으로 assets/book/ 의 웹용 이미지를 다시 만듭니다.

    python3 tools/make-book-images.py

원본은 "나의 이야기/" 안에 두고, 파일 이름 끝(확장자 앞)의 세 자리 숫자를
쪽 번호로 봅니다.  예) KakaoTalk_Photo_...-51 001.png -> assets/book/001.jpg

원본 파일은 용량이 커서 저장소에 올리지 않고(.gitignore), 여기서 만든 jpg 만 올립니다.
가로/세로 어느 쪽이든 원본 비율 그대로 두고, 긴 변이 MAX_EDGE 를 넘을 때만 줄입니다.

Pillow 가 필요합니다:  python3 -m pip install Pillow
"""

import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 가 필요합니다.  python3 -m pip install Pillow")

MAX_EDGE = 1024        # 긴 변 최대 길이 (웹에서 보기에 충분한 크기)
QUALITY = 78           # JPEG 품질
PAGE_NO = re.compile(r"(\d{3})$")

root = Path(__file__).resolve().parent.parent
src = root / "나의 이야기"
out = root / "assets" / "book"
out.mkdir(parents=True, exist_ok=True)

made = 0
for f in sorted(src.iterdir()):
    if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        continue

    m = PAGE_NO.search(f.stem)
    if not m:
        print(f"건너뜀 (쪽 번호를 못 찾음): {f.name}")
        continue

    im = Image.open(f)
    im = im.convert("RGB")

    scale = min(1.0, MAX_EDGE / max(im.size))
    if scale < 1.0:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

    dst = out / f"{m.group(1)}.jpg"
    im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True, subsampling=1)

    print(f"{f.name} -> assets/book/{dst.name}  ({im.width}x{im.height}, {dst.stat().st_size // 1024} KB)")
    made += 1

print(f"그림 {made} 장을 만들었습니다.")
