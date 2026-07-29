# 용산 글모음

손으로 눌러쓴 시와 글을 모아 둔 웹 서비스입니다.

**https://dknife.github.io/YS/**

## 구조

```
YS/
├─ index.html            # 페이지
├─ assets/
│  ├─ style.css
│  ├─ app.js
│  ├─ thumbs/            # 목록용 축소 이미지 (긴 변 900px)
│  └─ view/              # 상세보기용 이미지 (긴 변 2000px)
├─ data/
│  └─ poems.json         # 글 목록과 분류
└─ 시/
   ├─ *.jpg              # 원본 사진
   └─ *.txt              # 사진에서 옮겨 적은 글
```

## 글 고치기

`시/<제목>.txt` 파일을 고치면 사이트에 그대로 반영됩니다.
파일 첫 줄이 제목과 같으면 제목 줄로 표시되고, 나머지가 본문이 됩니다.

## 글 추가하기

1. `시/` 폴더에 `<제목>.jpg` 와 `<제목>.txt` 를 넣습니다.
2. 축소 이미지를 만듭니다 (아래 참고).
3. `data/poems.json` 의 `poems` 배열에 `{ "name": "<제목>", "category": "가족" }` 을 추가합니다.

분류는 `categories` 에 있는 값 중 하나를 씁니다: 가족, 기억, 자연, 황혼.

### 축소 이미지 만들기 (Windows PowerShell)

`tools/make-images.ps1` 을 실행하면 `시/` 안의 모든 jpg에 대해
`assets/thumbs` 와 `assets/view` 를 다시 만듭니다.
사진의 EXIF 회전 정보는 이미지에 직접 반영되고 태그는 제거됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-images.ps1
```

## 배포

`main` 브랜치의 루트를 GitHub Pages 소스로 지정하면 됩니다.
(저장소 Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`)

`.nojekyll` 파일이 있어 Jekyll 처리 없이 그대로 게시됩니다.
