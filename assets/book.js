(function () {
  'use strict';

  var SRC = '나의 이야기/할아버지이야기_텍스트.txt';
  var ART = 'assets/book/';
  var PRELOAD = 2;           // 지금 쪽 앞뒤로 미리 받아 둘 그림 수
  var HEAD_GAP = 88;         // 쪽 위로 되돌아갈 때 고정 머리말에 가리지 않을 만큼 띄우기

  var el = {
    pages: document.getElementById('pages'),
    bar: document.getElementById('progress-bar'),
    progress: document.getElementById('progress'),
    label: document.getElementById('page-label'),
    total: document.getElementById('page-total'),
    toc: document.getElementById('toc')
  };

  var pages = [];      // [{ no, kind, blocks:[{type,text}] }]
  var views = [];      // 쪽마다 만들어 둔 DOM
  var art = [];        // art[i] = 그 쪽 그림 <img>
  var turns = [];      // turns[i] = { prev, next } 그 쪽의 넘김 버튼
  var cur = 0;         // 지금 보고 있는 쪽 (0부터)

  var ARROW = {
    prev: 'M15 5l-7 7 7 7',
    next: 'M9 5l7 7-7 7'
  };

  function pad3(n) { return ('00' + n).slice(-3); }

  /* ---------- 파서 ----------
     #n   : 새 쪽
     -    : 제목
     --   : 작은 제목
     들여쓴 줄 : 인용(시)
     빈 줄  : 문단 구분
     쪽 번호 n 에는 assets/book/00n.jpg 그림이 따라붙는다
  --------------------------------------------------------------- */

  function parse(raw) {
    var lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var page = null;
    var para = [];
    var verse = [];

    function flushPara() {
      if (para.length) { page.blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
    }
    function flushVerse() {
      if (verse.length) { page.blocks.push({ type: 'verse', text: verse.join('\n') }); verse = []; }
    }
    function flushAll() { flushVerse(); flushPara(); }

    lines.forEach(function (line) {
      var m = line.match(/^\s*#\s*(\d+)\s*$/);
      if (m) {
        if (page) { flushAll(); out.push(page); }
        page = { no: parseInt(m[1], 10), kind: 'text', blocks: [] };
        return;
      }
      if (!page) return;

      if (!line.trim()) { flushAll(); return; }

      var sub = line.match(/^\s*--\s*(.+?)\s*$/);
      if (sub) { flushAll(); page.blocks.push({ type: 'sub', text: sub[1] }); return; }

      var title = line.match(/^\s*-\s*(.+?)\s*$/);
      if (title) { flushAll(); page.blocks.push({ type: 'title', text: title[1] }); return; }

      // 두 칸 이상 들여쓴 줄은 인용(노랫말·시)으로 본다
      if (/^\s{2,}\S/.test(line)) { flushPara(); verse.push(line.trim()); return; }

      flushVerse();
      para.push(line.trim());
    });

    if (page) { flushAll(); out.push(page); }

    out.forEach(function (p) {
      var hasTitle = p.blocks.some(function (b) { return b.type === 'title'; });
      var onlyHeads = p.blocks.length > 0 && p.blocks.every(function (b) {
        return b.type === 'title' || b.type === 'sub';
      });
      p.kind = hasTitle ? 'cover' : (onlyHeads ? 'chapter' : 'text');
    });

    return out;
  }

  /* ---------- 쪽 만들기 ----------
     1쪽은 그림 위에 제목을 얹은 표지,
     2쪽부터는 왼쪽에 그림 오른쪽에 그 쪽의 글 (좁은 화면에서는 위아래로)
  --------------------------------------------------------------- */

  // 넘김 버튼은 쪽마다 하나씩 만들어 그림 왼쪽 아래 / 글 오른쪽 아래에 붙인다
  function turnEl(dir) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'turn turn-' + dir;
    b.setAttribute('aria-label', dir === 'prev' ? '이전 쪽' : '다음 쪽');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ARROW[dir]);
    svg.appendChild(path);

    var label = document.createElement('span');
    label.textContent = dir === 'prev' ? '이전' : '다음';

    if (dir === 'prev') { b.appendChild(svg); b.appendChild(label); }
    else { b.appendChild(label); b.appendChild(svg); }

    b.addEventListener('click', function () { step(dir === 'prev' ? -1 : 1); });
    return b;
  }

  function artEl(i) {
    var wrap = document.createElement('div');
    wrap.className = 'page-art';

    var img = document.createElement('img');
    img.alt = pages[i].no + '쪽 그림';
    img.decoding = 'async';
    // 주소는 볼 때가 되면 넣는다 (한꺼번에 다 받지 않도록)
    img.dataset.src = ART + pad3(pages[i].no) + '.jpg';
    // 받기 전에는 세로 그림 자리만 잡아 두고, 받고 나면 원본 비율을 그대로 쓴다
    // (가로로 그린 쪽도 있어서 비율을 고정하지 않는다)
    img.addEventListener('load', function () { wrap.classList.add('is-loaded'); });
    img.addEventListener('error', function () { wrap.classList.add('is-missing'); });

    wrap.appendChild(img);
    art[i] = img;
    return wrap;
  }

  function textEl(page) {
    var box = document.createElement('div');
    box.className = 'page-text';

    // 글은 안쪽 상자에 담아 가운데에 앉히고, 쪽 번호는 늘 맨 아래에 둔다
    var inner = document.createElement('div');
    inner.className = 'page-text-inner';

    page.blocks.forEach(function (b) {
      var node;
      if (b.type === 'title') { node = document.createElement('h2'); node.className = 'p-title'; }
      else if (b.type === 'sub') { node = document.createElement('p'); node.className = 'p-sub'; }
      else if (b.type === 'verse') { node = document.createElement('p'); node.className = 'verse'; }
      else { node = document.createElement('p'); }
      node.textContent = b.text;
      inner.appendChild(node);
    });
    box.appendChild(inner);

    if (page.kind !== 'cover') {
      var foot = document.createElement('p');
      foot.className = 'page-no';
      foot.textContent = String(page.no);
      box.appendChild(foot);
    }
    return box;
  }

  function build() {
    el.pages.innerHTML = '';
    views = [];

    pages.forEach(function (page, i) {
      var view = document.createElement('article');
      view.className = 'page is-' + page.kind;

      var artBox = artEl(i);
      var textBox = textEl(page);

      var prev = turnEl('prev');
      var next = turnEl('next');
      artBox.appendChild(prev);      // 그림 왼쪽 아래
      textBox.appendChild(next);     // 글 오른쪽 아래
      turns[i] = { prev: prev, next: next };

      view.appendChild(artBox);
      view.appendChild(textBox);
      el.pages.appendChild(view);
      views.push(view);
    });

    buildToc();
    el.total.textContent = String(pages.length);
    el.progress.setAttribute('aria-valuemax', String(pages.length));
    apply();
  }

  function buildToc() {
    el.toc.innerHTML = '';
    pages.forEach(function (p, i) {
      if (p.kind !== 'cover' && p.kind !== 'chapter') return;
      // 표지는 제목을, 장 표제지는 작은 제목을 목차 이름으로 쓴다
      var want = p.kind === 'cover' ? 'title' : 'sub';
      var head = p.blocks.filter(function (b) { return b.type === want; });
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = head.length ? head[0].text : '표지';
      b.dataset.page = String(i);
      b.addEventListener('click', function () { goToPage(i); });
      el.toc.appendChild(b);
    });
  }

  /* ---------- 상태 반영 ---------- */

  function loadArtAround() {
    var from = Math.max(0, cur - PRELOAD);
    var to = Math.min(pages.length - 1, cur + PRELOAD);
    for (var i = from; i <= to; i++) {
      var img = art[i];
      if (img && img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
    }
  }

  function apply() {
    views.forEach(function (view, i) {
      var on = i === cur;
      view.classList.toggle('is-current', on);
      view.setAttribute('aria-hidden', String(!on));
    });

    el.label.textContent = String(cur + 1);
    el.bar.style.width = ((cur + 1) / pages.length * 100) + '%';
    el.progress.setAttribute('aria-valuenow', String(cur + 1));

    turns.forEach(function (t) {
      t.prev.disabled = cur === 0;
      t.next.disabled = cur >= pages.length - 1;
    });

    Array.prototype.forEach.call(el.toc.children, function (b) {
      b.setAttribute('aria-current', String(parseInt(b.dataset.page, 10) === cur));
    });

    loadArtAround();
    if (history.replaceState) history.replaceState(null, '', '#p' + (cur + 1));
  }

  // 쪽을 넘기면 그림을 위에서부터 볼 수 있게 스크롤을 되돌린다.
  // (이미 그 위쪽을 보고 있으면 굳이 내리지 않는다)
  function scrollToTop() {
    var top = el.pages.getBoundingClientRect().top + window.pageYOffset;
    var target = Math.max(0, top - HEAD_GAP);
    if (window.pageYOffset <= target + 1) return;

    var soft = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      window.scrollTo({ top: target, behavior: soft ? 'smooth' : 'auto' });
    } catch (e) {
      window.scrollTo(0, target);   // 옛 브라우저
    }
  }

  function step(d) {
    var next = Math.max(0, Math.min(pages.length - 1, cur + d));
    if (next === cur) return;
    cur = next;
    apply();
    scrollToTop();
  }

  function goToPage(i) {
    cur = Math.max(0, Math.min(pages.length - 1, i));
    apply();
    scrollToTop();
  }

  /* ---------- 조작 ---------- */

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'ArrowRight') { step(1); }
  });

  // 터치 스와이프 (세로로 읽으려고 움직인 것은 넘기지 않는다)
  var tx = null, ty = null;
  el.pages.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX;
    ty = e.changedTouches[0].clientY;
  }, { passive: true });
  el.pages.addEventListener('touchend', function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    tx = ty = null;
  }, { passive: true });

  /* ---------- 시작 ---------- */

  fetch(SRC.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    })
    .then(function (raw) {
      // build() 안의 apply() 가 주소를 덮어쓰므로 해시는 미리 읽어 둔다
      var m = (location.hash || '').match(/^#p(\d+)$/);

      pages = parse(raw);
      if (!pages.length) throw new Error('empty');
      if (m) cur = Math.max(0, Math.min(pages.length - 1, parseInt(m[1], 10) - 1));
      build();
    })
    .catch(function () {
      el.pages.innerHTML = '<article class="page is-current"><div class="page-text"><p>본문을 불러오지 못했습니다.</p></div></article>';
    });
})();
