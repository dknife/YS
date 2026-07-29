(function () {
  'use strict';

  var SRC = '나의 이야기/할아버지이야기_텍스트.txt';
  var MOBILE = '(max-width: 860px)';

  var el = {
    spread: document.getElementById('spread'),
    book: document.getElementById('book'),
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    bar: document.getElementById('progress-bar'),
    progress: document.getElementById('progress'),
    label: document.getElementById('page-label'),
    total: document.getElementById('page-total'),
    toc: document.getElementById('toc')
  };

  var pages = [];     // [{ no, kind, blocks:[{type,text}] }]
  var sheets = [];    // DOM
  var sheetCount = 0;
  var turned = 0;     // 넘긴 장 수 (데스크톱)
  var mPage = 0;      // 모바일에서 보고 있는 지면 인덱스

  function isMobile() { return window.matchMedia(MOBILE).matches; }

  /* ---------- 파서 ----------
     #n   : 새 지면
     -    : 제목
     --   : 작은 제목
     들여쓴 줄 : 인용(시)
     빈 줄  : 문단 구분
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

  /* ---------- 지면 만들기 ---------- */

  function leafEl(page, side) {
    var leaf = document.createElement('div');
    leaf.className = 'leaf ' + side;

    var body = document.createElement('div');
    body.className = 'leaf-body';

    if (!page) {
      leaf.classList.add('is-blank');
      leaf.appendChild(body);
      return leaf;
    }

    leaf.classList.add('is-' + page.kind);

    page.blocks.forEach(function (b) {
      var node;
      if (b.type === 'title') { node = document.createElement('h2'); node.className = 'p-title'; }
      else if (b.type === 'sub') { node = document.createElement('p'); node.className = 'p-sub'; }
      else if (b.type === 'verse') { node = document.createElement('p'); node.className = 'verse'; }
      else { node = document.createElement('p'); }
      node.textContent = b.text;
      body.appendChild(node);
    });

    var foot = document.createElement('div');
    foot.className = 'leaf-foot';
    foot.textContent = page.kind === 'cover' ? '' : String(page.no);

    leaf.appendChild(body);
    leaf.appendChild(foot);
    return leaf;
  }

  function build() {
    sheetCount = Math.ceil(pages.length / 2);
    el.spread.innerHTML = '';
    sheets = [];

    for (var i = 0; i < sheetCount; i++) {
      var sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.dataset.index = String(i);
      sheet.appendChild(leafEl(pages[i * 2] || null, 'front'));
      sheet.appendChild(leafEl(pages[i * 2 + 1] || null, 'back'));
      el.spread.appendChild(sheet);
      sheets.push(sheet);
    }

    el.total.textContent = pages.length;
    el.progress.setAttribute('aria-valuemax', String(pages.length));
    buildToc();
    apply();
  }

  function buildToc() {
    el.toc.innerHTML = '';
    pages.forEach(function (p, i) {
      if (p.kind !== 'cover' && p.kind !== 'chapter') return;
      // 표지는 제목을, 장 표제지는 작은 제목을 목차 이름으로 쓴다
      var want = p.kind === 'cover' ? 'title' : 'sub';
      var head = p.blocks.filter(function (b) { return b.type === want; });
      var label = head.length ? head[0].text : '표지';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.page = String(i);
      b.addEventListener('click', function () { goToPage(i); });
      el.toc.appendChild(b);
    });
  }

  /* ---------- 상태 반영 ---------- */

  // 장을 k번 넘긴 상태에서 왼쪽/오른쪽에 놓이는 지면의 인덱스
  function leftIndex(k)  { return k * 2 - 1; }
  function rightIndex(k) { return k * 2; }

  // 마지막 지면이 오른쪽에 남도록 넘길 수 있는 최대치
  function maxTurned() { return Math.ceil((pages.length - 1) / 2); }

  function apply() {
    var mobile = isMobile();

    sheets.forEach(function (sheet, i) {
      sheet.classList.toggle('flipped', i < turned);
      sheet.style.zIndex = String(i < turned ? i + 1 : sheetCount - i + 1);

      var front = sheet.querySelector('.leaf.front');
      var back = sheet.querySelector('.leaf.back');

      if (mobile) {
        var isActive = Math.floor(mPage / 2) === i;
        sheet.classList.toggle('m-active', isActive);
        front.classList.toggle('m-show', isActive && mPage % 2 === 0);
        back.classList.toggle('m-show', isActive && mPage % 2 === 1);
      } else {
        sheet.classList.remove('m-active');
        front.classList.remove('m-show');
        back.classList.remove('m-show');
      }
    });

    var li = leftIndex(turned), ri = rightIndex(turned);
    var hasLeft = li >= 0 && li < pages.length;
    var hasRight = ri >= 0 && ri < pages.length;

    // 한 쪽만 있을 때는 펼친 책을 가운데로 옮긴다
    el.spread.classList.toggle('at-start', !mobile && !hasLeft);
    el.spread.classList.toggle('at-end', !mobile && !hasRight);

    var label;
    if (mobile) label = String(mPage + 1);
    else if (hasLeft && hasRight) label = (li + 1) + '–' + (ri + 1);
    else label = String((hasRight ? ri : li) + 1);

    var progressed = mobile ? mPage + 1 : (hasRight ? ri + 1 : li + 1);
    el.label.textContent = label;
    el.bar.style.width = (progressed / pages.length * 100) + '%';
    el.progress.setAttribute('aria-valuenow', String(progressed));

    el.prev.disabled = mobile ? mPage === 0 : turned === 0;
    el.next.disabled = mobile ? mPage >= pages.length - 1 : turned >= maxTurned();

    Array.prototype.forEach.call(el.toc.children, function (b) {
      var p = parseInt(b.dataset.page, 10);
      var on = mobile ? p === mPage : (p === li || p === ri);
      b.setAttribute('aria-current', String(on));
    });

    if (history.replaceState) history.replaceState(null, '', '#p' + progressed);
  }

  function step(d) {
    if (isMobile()) mPage = Math.max(0, Math.min(pages.length - 1, mPage + d));
    else turned = Math.max(0, Math.min(maxTurned(), turned + d));
    apply();
  }

  function goToPage(i) {
    i = Math.max(0, Math.min(pages.length - 1, i));
    mPage = i;
    turned = i === 0 ? 0 : Math.min(maxTurned(), Math.floor((i + 1) / 2));
    apply();
    el.book.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- 조작 ---------- */

  el.prev.addEventListener('click', function () { step(-1); });
  el.next.addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'ArrowRight') { step(1); }
  });

  // 지면 좌/우를 눌러 넘기기 (글을 읽는 중 스크롤과 겹치지 않도록 여백만)
  el.book.addEventListener('click', function (e) {
    if (e.target.closest('.leaf-body')) return;
    var r = el.book.getBoundingClientRect();
    step(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });

  // 터치 스와이프
  var tx = null;
  el.book.addEventListener('touchstart', function (e) { tx = e.changedTouches[0].clientX; }, { passive: true });
  el.book.addEventListener('touchend', function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    tx = null;
  }, { passive: true });

  var mq = window.matchMedia(MOBILE);
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
    if (isMobile()) mPage = Math.max(0, Math.min(pages.length - 1, rightIndex(turned)));
    else turned = mPage === 0 ? 0 : Math.min(maxTurned(), Math.floor((mPage + 1) / 2));
    apply();
  });

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
      build();

      if (m) goToPage(parseInt(m[1], 10) - 1);
    })
    .catch(function () {
      el.spread.innerHTML = '<div class="leaf front"><div class="leaf-body"><p>본문을 불러오지 못했습니다.</p></div></div>';
    });
})();
