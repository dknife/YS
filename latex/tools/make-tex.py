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
import unicodedata
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


# ---- 두 단으로 앉히기 ----------------------------------------------
# 글이 많아 글자를 줄여야 하는 시는 두 단으로 나누면 글자를 키울 수 있다.
# 다만 시행이 길면 좁은 단에서 줄이 접히므로, 두 단이 정말 이로울 때만 쓴다.

COL_PT = 215.0          # 한 단의 폭 (0.47 x 162mm)
STAGGER_PT = 34.0       # 오른쪽 단을 내려 앉히는 만큼 (12mm)
TWOCOL_SIZES = [(13.0, 22.0), (12.5, 20.5), (12.0, 19.0), (11.5, 18.0), (11.0, 17.0)]


def line_width_em(s: str) -> float:
    """한 줄의 폭을 글자 수로 어림한다. 한글·한자는 한 칸, 나머지는 반 칸."""
    return sum(1.0 if unicodedata.east_asian_width(c) in ("W", "F") else 0.5 for c in s)


def twocol_size(body: str):
    """두 단으로 앉힐 때 쓸 수 있는 가장 큰 글자. 이로울 게 없으면 None."""
    lines = [l.strip() for l in body.split("\n") if l.strip()]
    if not lines:
        return None
    widest = max(line_width_em(l) for l in lines)
    units = poem_units(body)

    for size, lead in TWOCOL_SIZES:
        if size * widest > COL_PT:                 # 시행이 단 폭을 넘으면 접힌다
            continue
        capacity = (AVAILABLE_PT + AVAILABLE_PT - STAGGER_PT) / lead
        if units <= capacity:
            return size, lead
    return None


def split_stanzas(body: str, lead: float):
    """두 단에 나눠 담는다. 오른쪽 단이 내려 앉은 만큼 왼쪽에 조금 더 담아
    두 단이 비슷한 높이에서 끝나게 한다."""
    stanzas = [b.strip() for b in re.split(r"\n\s*\n", body) if b.strip()]
    if len(stanzas) < 2:
        return None

    def units_of(group):
        text = "\n\n".join(group)
        return poem_units(text) if group else 0.0

    stagger_units = STAGGER_PT / lead
    best, best_gap = 1, None
    for cut in range(1, len(stanzas)):
        gap = abs(units_of(stanzas[:cut]) - units_of(stanzas[cut:]) - stagger_units)
        if best_gap is None or gap < best_gap:
            best, best_gap = cut, gap
    return stanzas[:best], stanzas[best:]


def stanzas_tex(blocks) -> str:
    out = []
    for block in blocks:
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        out.append(" \\\\\n".join(tex(l) for l in lines))
        out.append("")
    return "\n".join(out).rstrip()


def write_poems(data) -> int:
    poem_img.mkdir(parents=True, exist_ok=True)
    out = ["%% 자동 생성 — latex/tools/make-tex.py 가 만든다. 직접 고치지 말 것.", ""]

    # 분류 차례대로 묶어 싣는다
    order = [c for c in data.get("categories", []) if c != "전체"]
    poems = data["poems"]
    count = 0
    twocol = []

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

            # 글자를 줄여야 하는 시는 두 단으로 나눠 키울 수 있는지 본다
            wide = twocol_size(body) if size < SIZE_LADDER[0][1] else None
            halves = split_stanzas(body, wide[1]) if wide else None

            if wide and halves and wide[0] > size:
                left, right = halves
                out.append(f"\\yspoemcols{{{wide[0]}}}{{{wide[1]}}}{{%")
                out.append(stanzas_tex(left))
                out.append("}{%")
                out.append(stanzas_tex(right))
                out.append("}")
                twocol.append((name, size, wide[0]))
            else:
                out.append(f"\\begin{{poembody}}{{{size}}}{{{lead}}}")
                out.append(stanzas_tex(re.split(r"\n\s*\n", body)))
                out.append("\\end{poembody}")
            out.append("")

    gen.joinpath("poems.tex").write_text("\n".join(out), encoding="utf-8")
    for name, before, after in twocol:
        print(f"  두 단으로: {name} ({before}pt -> {after}pt)")
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
