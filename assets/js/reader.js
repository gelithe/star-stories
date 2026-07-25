// Star Stories — reader: calls /api/generate and streams the book onto "paper".
// The server returns house-style HTML (book classes); we render it progressively.
// NOTE (MVP): the streamed HTML is model output rendered via innerHTML. Fine for
// owner testing; sanitize before this is public-facing with untrusted input.

let _readerCtl = null; // AbortController for the in-flight request
let _lastPayload = null;

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
  let noted = false;
  for (const fig of figs) {
    const scene = fig.dataset.scene;
    if (!scene) continue;
    fig.classList.add('is-painting');
    try {
      const res = await fetch('/api/illustrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene, element, motif: fig.dataset.motif, accessCode }),
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ssReader').classList.contains('is-open')) closeReader();
  });
});
