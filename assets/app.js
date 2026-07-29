(function () {
  'use strict';

  var SRC_DIR = '시';            // 원본 사진과 옮겨 적은 글(.txt)이 있는 폴더
  var THUMB_DIR = 'assets/thumbs';
  var VIEW_DIR = 'assets/view';

  var state = { poems: [], filtered: [], filter: '전체', index: -1 };
  var textCache = {};

  var el = {
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty'),
    filters: document.getElementById('filters'),
    viewer: document.getElementById('viewer'),
    vTitle: document.getElementById('viewer-title'),
    vCount: document.getElementById('viewer-count'),
    vImg: document.getElementById('viewer-img'),
    vText: document.getElementById('viewer-text'),
    vOrig: document.getElementById('viewer-orig'),
    vClose: document.getElementById('viewer-close'),
    vPrev: document.getElementById('viewer-prev'),
    vNext: document.getElementById('viewer-next')
  };

  function enc(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function fetchText(name) {
    if (textCache[name]) return Promise.resolve(textCache[name]);
    return fetch(enc(SRC_DIR + '/' + name + '.txt'), { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; })
      .then(function (t) { textCache[name] = t; return t; });
  }

  // 본문에서 제목 줄을 떼어낸다 (첫 줄이 제목과 같으면 제거)
  function splitTitle(name, raw) {
    var lines = raw.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    var head = lines.length ? lines[0].trim() : '';
    var bare = function (s) { return s.replace(/[.\s]/g, ''); };
    if (head && bare(head) === bare(name)) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
    }
    return { title: head || name, body: lines.join('\n').replace(/\s+$/, '') };
  }

  function excerpt(body) {
    var lines = body.split('\n').filter(function (l) { return l.trim(); });
    return lines.slice(0, 2).join('\n');
  }

  /* ---------- 목록 ---------- */

  function buildCard(poem, i) {
    var btn = document.createElement('button');
    btn.className = 'card';
    btn.type = 'button';

    var thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    var img = document.createElement('img');
    img.src = enc(THUMB_DIR + '/' + poem.name + '.jpg');
    img.alt = poem.name + ' 원고 사진';
    img.loading = 'lazy';
    img.decoding = 'async';
    thumb.appendChild(img);

    var body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML =
      '<span class="card-cat">' + poem.category + '</span>' +
      '<h2 class="card-title"></h2>' +
      '<p class="card-excerpt"></p>';
    body.querySelector('.card-title').textContent = poem.name;

    btn.appendChild(thumb);
    btn.appendChild(body);
    btn.addEventListener('click', function () { open(i); });

    fetchText(poem.name).then(function (raw) {
      if (!raw) return;
      body.querySelector('.card-excerpt').textContent = excerpt(splitTitle(poem.name, raw).body);
    });

    return btn;
  }

  function render() {
    state.filtered = state.filter === '전체'
      ? state.poems.slice()
      : state.poems.filter(function (p) { return p.category === state.filter; });

    el.grid.innerHTML = '';
    state.filtered.forEach(function (p, i) { el.grid.appendChild(buildCard(p, i)); });
    el.empty.hidden = state.filtered.length > 0;
  }

  function buildFilters(categories) {
    categories.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = cat;
      b.setAttribute('aria-pressed', String(cat === state.filter));
      b.addEventListener('click', function () {
        state.filter = cat;
        Array.prototype.forEach.call(el.filters.children, function (c) {
          c.setAttribute('aria-pressed', String(c === b));
        });
        render();
      });
      el.filters.appendChild(b);
    });
  }

  /* ---------- 뷰어 ---------- */

  function open(i) {
    if (i < 0 || i >= state.filtered.length) return;
    state.index = i;
    var poem = state.filtered[i];

    el.vTitle.textContent = poem.name;
    el.vCount.textContent = (i + 1) + ' / ' + state.filtered.length;
    el.vImg.src = enc(VIEW_DIR + '/' + poem.name + '.jpg');
    el.vImg.alt = poem.name + ' 원고 사진';
    el.vOrig.href = enc(SRC_DIR + '/' + poem.name + '.jpg');
    el.vText.innerHTML = '<span class="loading">글을 불러오는 중…</span>';

    fetchText(poem.name).then(function (raw) {
      if (state.index !== i) return;
      if (!raw) {
        el.vText.textContent = '옮겨 적은 글이 아직 없습니다.';
        return;
      }
      var parts = splitTitle(poem.name, raw);
      el.vText.innerHTML = '';
      var h = document.createElement('span');
      h.className = 'poem-title';
      h.textContent = parts.title;
      el.vText.appendChild(h);
      el.vText.appendChild(document.createTextNode(parts.body));
    });

    el.viewer.hidden = false;
    document.body.style.overflow = 'hidden';
    el.vClose.focus();
    if (history.replaceState) history.replaceState(null, '', '#' + encodeURIComponent(poem.name));
  }

  function close() {
    el.viewer.hidden = true;
    state.index = -1;
    document.body.style.overflow = '';
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
  }

  function step(d) {
    var n = state.index + d;
    if (n < 0) n = state.filtered.length - 1;
    if (n >= state.filtered.length) n = 0;
    open(n);
  }

  el.vClose.addEventListener('click', close);
  el.vPrev.addEventListener('click', function () { step(-1); });
  el.vNext.addEventListener('click', function () { step(1); });
  el.viewer.addEventListener('click', function (e) { if (e.target === el.viewer) close(); });

  document.addEventListener('keydown', function (e) {
    if (el.viewer.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  /* ---------- 시작 ---------- */

  fetch('data/poems.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.poems = data.poems || [];
      buildFilters(data.categories || ['전체']);
      render();

      var hash = decodeURIComponent((location.hash || '').slice(1));
      if (hash) {
        var i = state.filtered.findIndex(function (p) { return p.name === hash; });
        if (i >= 0) open(i);
      }
    })
    .catch(function () {
      el.empty.hidden = false;
      el.empty.textContent = '목록을 불러오지 못했습니다.';
    });
})();
