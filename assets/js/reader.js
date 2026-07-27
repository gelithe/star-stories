// Star Stories — reader: calls /api/generate and streams the book onto "paper".
// The server returns house-style HTML (book classes); we render it progressively.
// NOTE (MVP): the streamed HTML is model output rendered via innerHTML. Fine for
// owner testing; sanitize before this is public-facing with untrusted input.

let _readerCtl = null; // AbortController for the in-flight request
let _lastPayload = null;

// ── reading mode: 'page' (turn one spread at a time, default) | 'scroll' ──
let _mode = 'page';
let _bookReady = false;   // spreads are only built once the book finishes writing
let _spreads = [];
let _pageIndex = 0;

// Split the finished book (#ssPaper) into one card per spread — a fresh spread
// begins at each illustration, and the chant + parents' page get their own.
// Mirrors bookexport's pagination but keeps the on-screen reader styling.
function buildSpreads() {
  const paper = document.getElementById('ssPaper');
  const pages = document.getElementById('ssPages');
  if (!paper || !pages) return;
  pages.innerHTML = '';
  _spreads = [];
  let cur = null;
  const fresh = () => { cur = document.createElement('article'); cur.className = 'ss-paper ss-spread'; pages.appendChild(cur); _spreads.push(cur); };
  for (const node of [...paper.children]) {
    const cls = node.className || '';
    if (node.tagName === 'FIGURE') { fresh(); cur.appendChild(node.cloneNode(true)); continue; }
    if (cls.includes('ch-title')) { if (!cur || cur.querySelector('.scene,.verse,.ch-title')) fresh(); cur.appendChild(node.cloneNode(true)); continue; }
    if (cls.includes('spell') || cls.includes('parents')) { fresh(); cur.appendChild(node.cloneNode(true)); continue; }
    if (!cur) fresh();
    cur.appendChild(node.cloneNode(true));
  }
  _pageIndex = 0;
}

function applyReaderMode() {
  const paper = document.getElementById('ssPaper');
  const pages = document.getElementById('ssPages');
  const nav = document.getElementById('ssPageNav');
  if (!paper || !pages) return;
  const pageOn = _mode === 'page' && _bookReady && _spreads.length > 0;
  paper.style.display = pageOn ? 'none' : '';
  pages.style.display = pageOn ? 'block' : 'none';
  if (nav) nav.style.display = pageOn ? 'flex' : 'none';
  const bp = document.getElementById('rbModePage'), bs = document.getElementById('rbModeScroll');
  if (bp) bp.classList.toggle('on', _mode === 'page');
  if (bs) bs.classList.toggle('on', _mode === 'scroll');
  if (pageOn) gotoSpread(_pageIndex);
}

function gotoSpread(n) {
  if (!_spreads.length) return;
  _pageIndex = Math.max(0, Math.min(_spreads.length - 1, n));
  _spreads.forEach((s, k) => s.classList.toggle('active', k === _pageIndex));
  const c = document.getElementById('rbCount');
  if (c) c.textContent = `${_pageIndex + 1} / ${_spreads.length}`;
  const p = document.getElementById('rbPrev'), nx = document.getElementById('rbNext');
  if (p) p.disabled = _pageIndex === 0;
  if (nx) nx.disabled = _pageIndex >= _spreads.length - 1;
  const el = _spreads[_pageIndex]; if (el) el.scrollIntoView({ block: 'nearest' });
}

function setReaderMode(m) { _mode = m; applyReaderMode(); }

function openReader(payload, title) {
  _lastPayload = payload;
  const el = document.getElementById('ssReader');
  el.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.getElementById('rbTitle').textContent = title || 'Your book';
  streamBook(payload);
}

function closeReader() {
  if (_readerCtl) { _readerCtl.abort(); _readerCtl = null; }
  document.getElementById('ssReader').classList.remove('is-open');
  document.body.style.overflow = '';
}

function retryBook() { if (_lastPayload) streamBook(_lastPayload); }

async function streamBook(payload) {
  const paper = document.getElementById('ssPaper');
  const status = document.getElementById('rbStatus');
  const errBox = document.getElementById('rbError');
  errBox.classList.remove('is-on');
  errBox.textContent = '';
  paper.innerHTML = '';
  paper.classList.add('is-writing');
  // While writing, always show the continuous page; page-turn switches on once done.
  _bookReady = false; _spreads = []; applyReaderMode();
  status.textContent = 'writing…';
  const dlBtn = document.getElementById('rbDownload');
  if (dlBtn) dlBtn.style.display = 'none';

  if (_readerCtl) _readerCtl.abort();
  _readerCtl = new AbortController();

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: _readerCtl.signal,
    });

    if (!res.ok || !res.body) {
      let msg = `Generation failed (HTTP ${res.status}).`;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
      showReaderError(msg, res.status);
      return;
    }

    const element = (typeof state !== 'undefined' && state.element) || 'Water';
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = '';
    let raf = null;
    const paint = () => {
      raf = null;
      paper.innerHTML = acc;
      // fill illustration slots as scenes stream in (vector is instant & safe)
      if (typeof ART !== 'undefined') ART.fill(paper, element);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      if (!raf) raf = requestAnimationFrame(paint);
    }
    if (raf) cancelAnimationFrame(raf);
    paper.innerHTML = acc || '<p class="scene">The sky was quiet — try again.</p>';
    if (typeof ART !== 'undefined') ART.fill(paper, element);
    paper.classList.remove('is-writing');
    status.textContent = 'done';
    const dl = document.getElementById('rbDownload');
    if (dl && acc) dl.style.display = '';

    // Painted mode (opt-in): replace the vector scenes with rendered art.
    if (typeof state !== 'undefined' && state.artStyle === 'painted') {
      status.textContent = 'painting…';
      await paintIllustrations(paper, element, payload.accessCode);
      status.textContent = 'done';
    }

    // Book is finished — paginate into spreads and switch to page-turn if selected.
    buildSpreads();
    _bookReady = true;
    applyReaderMode();
  } catch (e) {
    if (e.name === 'AbortError') return; // closed/retried intentionally
    showReaderError('Network error while writing the book — please retry.');
  }
}

function showReaderError(msg, status) {
  const paper = document.getElementById('ssPaper');
  const st = document.getElementById('rbStatus');
  const errBox = document.getElementById('rbError');
  paper.classList.remove('is-writing');
  st.textContent = '';
  let hint = '';
  if (status === 500) hint = ' — the server is likely missing ANTHROPIC_API_KEY (set it in Cloudflare → Settings → Environment variables).';
  if (status === 401) hint = ' — enter your Access code in the form (under “Your book”) and try again.';
  errBox.textContent = msg + hint;
  errBox.classList.add('is-on');
}

// Painted mode (opt-in): render each scene via /api/illustrate, swap over the
// vector art. Sequential and fault-tolerant — on any failure it keeps the
// house-style SVG that's already in the slot and notes it once.
async function paintIllustrations(paper, element, accessCode) {
  const figs = [...paper.querySelectorAll('figure.art[data-scene]')];
  // The book's companion (Chinese animal) so scenes render the same recurring
  // avatar; the server pins its canonical look. See AVATARS.md / companions.json.
  const chart = (typeof state !== 'undefined' && state.chartText) || '';
  const cm = /Chinese:\s+\w+\s+(Rat|Ox|Tiger|Rabbit|Dragon|Snake|Horse|Goat|Monkey|Rooster|Dog|Pig)/.exec(chart);
  const companion = cm ? cm[1] : '';
  let noted = false;
  for (const fig of figs) {
    const scene = fig.dataset.scene;
    if (!scene) continue;
    fig.classList.add('is-painting');
    try {
      const res = await fetch('/api/illustrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene, element, motif: fig.dataset.motif, companion, accessCode }),
        signal: _readerCtl && _readerCtl.signal,
      });
      if (!res.ok) throw new Error('illustrate ' + res.status);
      const j = await res.json();
      if (j && j.url) {
        const img = new Image();
        img.src = j.url; img.alt = scene; img.className = 'ss-art-img';
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
        fig.innerHTML = ''; fig.appendChild(img);
      } else { throw new Error('no url'); }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (!noted) {
        noted = true;
        const box = document.getElementById('rbError');
        box.textContent = 'Painted mode is not available yet (no image key on the server) — showing the house style instead.';
        box.classList.add('is-on');
      }
      break; // don't hammer a missing/broken endpoint for every scene
    } finally {
      fig.classList.remove('is-painting');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bind('#rbClose', 'click', closeReader);
  bind('#rbRetry', 'click', retryBook);
  bind('#rbDownload', 'click', () => { if (typeof exportBook === 'function') exportBook(); });
  bind('#rbModePage', 'click', () => setReaderMode('page'));
  bind('#rbModeScroll', 'click', () => setReaderMode('scroll'));
  bind('#rbPrev', 'click', () => gotoSpread(_pageIndex - 1));
  bind('#rbNext', 'click', () => gotoSpread(_pageIndex + 1));
  document.addEventListener('keydown', e => {
    const open = document.getElementById('ssReader').classList.contains('is-open');
    if (!open) return;
    if (e.key === 'Escape') { closeReader(); return; }
    // Arrow keys turn pages only when the page-turn reader is live.
    if (_mode === 'page' && _bookReady && _spreads.length > 0) {
      if (e.key === 'ArrowLeft') { gotoSpread(_pageIndex - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { gotoSpread(_pageIndex + 1); e.preventDefault(); }
    }
  });
});
