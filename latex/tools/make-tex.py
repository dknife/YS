#!/usr/bin/env python3
"""원고를 읽어 책에 넣을 tex 조각을 만든다.

    python3 latex/tools/make-tex.py

사이트가 읽는 원고 파일을 그대로 읽으므로, 글을 고치면 책도 따라 바뀐다.

  나의 이야기/할아버지이야기_텍스트.txt  ->  generated/story.tex
  data/poems.json + 시/*.txt            ->  generated/poems.tex
  시 원고 사진 (assets/view/*.jpg)       ->  images/poems/NN.jpg  (이름을 영문으로)

시 사진은 파일 이름이 한글이라 그대로 두면 XeLaTeX 이 찾지 못한다.
그래서 번호를 붙인 이름으로 복사해 둔다.
"""

import json
import re
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent.parent   # 저장소 뿌리
latex = root / "latex"
gen = latex / "generated"
poem_img = latex / "images" / "poems"

STORY_TXT = root / "나의 이야기" / "할아버지이야기_텍스트.txt"
POEM_JSON = root / "data" / "poems.json"
POEM_DIR = root / "시"
VIEW_DIR = root / "assets" / "view"

# 분류마다 색을 달리해 시를 찾기 쉽게 한다 (preamble.tex 에 정의된 색 이름)
CATEGORY_COLOR = {
    "가족": "ysplum",
    "기억": "ysblue",
    "자연": "ysgreen",
    "황혼": "ysgold",
}

ESCAPE = {
    "\\": r"\textbackslash{}",
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
    "_": r"\_", "{": r"\{", "}": r"\}",
    "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


def tex(s: str) -> str:
    """본문 글자를 tex 에 넣어도 안전하게 바꾼다."""
    return "".join(ESCAPE.get(c, c) for c in s)


# ------------------------------------------------------------------
# 나의 이야기 — 사이트의 assets/book.js 와 같은 규칙으로 읽는다
#   #n   새 쪽        - 제목      -- 작은 제목
#   두 칸 이상 들여쓴 줄 = 노랫말   빈 줄 = 문단 나눔
# ------------------------------------------------------------------

def parse_story(raw: str):
    pages, page, para, verse = [], None, [], []

    def flush_para():
        if para:
            page["blocks"].append(("p", " ".join(para)))
            para.clear()

    def flush_verse():
        if verse:
            page["blocks"].append(("verse", "\n".join(verse)))
            verse.clear()

    def flush():
        flush_verse()
        flush_para()

    for line in raw.replace("\ufeff", "").replace("\r\n", "\n").split("\n"):
        m = re.match(r"^\s*#\s*(\d+)\s*$", line)
        if m:
            if page:
                flush()
                pages.append(page)
            page = {"no": int(m.group(1)), "blocks": []}
            continue
        if page is None:
            continue

        if not line.strip():
            flush()
            continue

        m = re.match(r"^\s*--\s*(.+?)\s*$", line)
        if m:
            flush()
            page["blocks"].append(("sub", m.group(1)))
            continue

        m = re.match(r"^\s*-\s*(.+?)\s*$", line)
        if m:
            flush()
            page["blocks"].append(("title", m.group(1)))
            continue

        if re.match(r"^\s{2,}\S", line):
            flush_para()
            verse.append(line.strip())
            continue

        flush_verse()
        para.append(line.strip())

    if page:
        flush()
        pages.append(page)

    for p in pages:
        kinds = {k for k, _ in p["blocks"]}
        if "title" in kinds:
            p["kind"] = "cover"
        elif p["blocks"] and kinds <= {"title", "sub"}:
            p["kind"] = "chapter"
        else:
            p["kind"] = "text"
    return pages


def art(no: int) -> str:
    """그 쪽 그림. 없으면 None."""
    name = f"{no:03d}.jpg"
    return name if (root / "assets" / "book" / name).exists() else None


def write_story(pages) -> int:
    out = ["%% 자동 생성 — latex/tools/make-tex.py 가 만든다. 직접 고치지 말 것.", ""]
    count = 0

    for p in pages:
        picture = art(p["no"])

        if p["kind"] == "cover":
            continue                      # 표지는 앞표지·부 표지에서 따로 쓴다

        if p["kind"] == "chapter":
            head = next(t for k, t in p["blocks"] if k == "sub")
            out.append(f"\\yschapter{{{tex(head)}}}{{{picture}}}")
            out.append("")
            count += 1
            continue

        out.append(f"\\begin{{storypage}}{{{picture}}}")
        for kind, text in p["blocks"]:
            if kind == "verse":
                lines = " \\\\\n  ".join(tex(l) for l in text.split("\n"))
                out.append(f"\\ysverse{{%\n  {lines}%\n}}")
            else:
                out.append(tex(text))
                out.append("")
        out.append("\\end{storypage}")
        out.append("")
        count += 1

    gen.joinpath("story.tex").write_text("\n".join(out), encoding="utf-8")
    return count


# ------------------------------------------------------------------
# 시 모음
# ------------------------------------------------------------------

def poem_text(name: str):
    """시 한 편을 (제목, 본문) 으로 나눈다. 첫 줄이 제목과 같으면 제목 줄로 본다."""
    f = POEM_DIR / f"{name}.txt"
    if not f.exists():
        return None
    raw = f.read_text(encoding="utf-8").replace("\ufeff", "").replace("\r\n", "\n")
    lines = raw.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].strip() == name.strip():
        lines.pop(0)
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines)


# 시 한 편이 한 면에 들어가도록 길이에 맞춰 글자 크기를 고른다.
#
# 시는 마주 보는 왼쪽 면의 제목 아래 높이(\ysheadgap = 32mm)에서 시작하므로
# 쓸 수 있는 높이는 판면 208mm 에서 32mm 를 뺀 176mm, 곧 약 500pt 이다.
# 사진 아래에 해당하는 자리까지 내려써도 되므로 그 높이를 다 쓴다.
# 연 사이 빈 줄은 한 줄의 0.75 만큼으로 친다.
AVAILABLE_PT = 492
SIZE_LADDER = [
    (22, 13.0, 22.0),
    (24, 12.5, 20.5),
    (26, 12.0, 19.0),
    (28, 11.5, 17.5),
    (30, 11.0, 16.5),
]
SIZE_FLOOR = (10.0, 14.8)


def poem_units(body: str) -> float:
    stanzas = [b for b in re.split(r"\n\s*\n", body) if b.strip()]
    lines = sum(1 for l in body.split("\n") if l.strip())
    return lines + 0.75 * max(0, len(stanzas) - 1)


def poem_size(body: str):
    units = poem_units(body)
    for limit, size, lead in SIZE_LADDER:
        if units <= limit:
            return size, lead
    return SIZE_FLOOR


def write_poems(data) -> int:
    poem_img.mkdir(parents=True, exist_ok=True)
    out = ["%% 자동 생성 — latex/tools/make-tex.py 가 만든다. 직접 고치지 말 것.", ""]

    # 분류 차례대로 묶어 싣는다
    order = [c for c in data.get("categories", []) if c != "전체"]
    poems = data["poems"]
    count = 0

    for cat in order:
        group = [p for p in poems if p.get("category") == cat]
        if not group:
            continue
        color = CATEGORY_COLOR.get(cat, "ysorange")

        for poem in group:
            name = poem["name"]
            body = poem_text(name)
            if body is None:
                print(f"  건너뜀 (글이 없음): {name}")
                continue

            count += 1
            picture = None
            src = VIEW_DIR / f"{name}.jpg"
            if src.exists():
                dst = poem_img / f"{count:02d}.jpg"
                shutil.copyfile(src, dst)
                picture = f"poems/{count:02d}.jpg"

            # 왼쪽(홀수) 면에 원고 사진, 마주 보는 면에 제목과 옮겨 적은 글
            out.append(f"\\yspoemstart{{{tex(name)}}}")
            if picture:
                out.append(f"\\yspoemplate{{{tex(name)}}}{{{tex(cat)}}}{{{color}}}{{{picture}}}")
            else:
                out.append(f"\\yspoemplateonly{{{tex(name)}}}{{{tex(cat)}}}{{{color}}}")
            size, lead = poem_size(body)
            out.append(f"\\begin{{poembody}}{{{size}}}{{{lead}}}")
            for block in re.split(r"\n\s*\n", body):
                lines = [l.strip() for l in block.split("\n") if l.strip()]
                if not lines:
                    continue
                out.append(" \\\\\n".join(tex(l) for l in lines))
                out.append("")
            out.append("\\end{poembody}")
            out.append("")

    gen.joinpath("poems.tex").write_text("\n".join(out), encoding="utf-8")
    return count


def main():
    if not STORY_TXT.exists():
        sys.exit(f"원고를 찾을 수 없습니다: {STORY_TXT}")
    gen.mkdir(parents=True, exist_ok=True)

    pages = parse_story(STORY_TXT.read_text(encoding="utf-8"))
    n_story = write_story(pages)
    print(f"나의 이야기 {n_story} 쪽 -> generated/story.tex")

    data = json.loads(POEM_JSON.read_text(encoding="utf-8"))
    n_poems = write_poems(data)
    print(f"시 {n_poems} 편 -> generated/poems.tex")

    missing = [p["no"] for p in pages if art(p["no"]) is None]
    if missing:
        print(f"그림이 없는 쪽: {missing}")


if __name__ == "__main__":
    main()
