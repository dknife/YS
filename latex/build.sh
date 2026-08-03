#!/bin/sh
# 「용산 글모음」 책 PDF 를 만든다.
#
#     sh latex/build.sh
#
# 원고(나의 이야기/*.txt, 시/*.txt)를 읽어 tex 조각을 새로 만들고
# XeLaTeX 을 두 번 돌려 차례까지 채운 main.pdf 를 남긴다.

set -e

here=$(cd "$(dirname "$0")" && pwd)
cd "$here"

echo "원고를 tex 으로 옮기는 중..."
python3 tools/make-tex.py

echo "XeLaTeX (1/2)..."
xelatex -interaction=nonstopmode -halt-on-error main.tex > build.log 2>&1 || {
  echo "실패 — build.log 에서 아래 오류를 보세요:"
  grep -E "^! " -A 4 build.log | head -30
  exit 1
}

echo "XeLaTeX (2/2)..."
xelatex -interaction=nonstopmode -halt-on-error main.tex >> build.log 2>&1 || {
  echo "실패 — build.log 를 보세요."
  exit 1
}

pages=$(grep -o "Output written on main.pdf ([0-9]* pages" build.log | tail -1 | grep -o "[0-9]*" | tail -1)
echo "다 됐습니다 -> latex/main.pdf (${pages}쪽)"
