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

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = '';
    let raf = null;
    const paint = () => { raf = null; paper.innerHTML = acc; };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      if (!raf) raf = requestAnimationFrame(paint);
    }
    if (raf) cancelAnimationFrame(raf);
    paper.innerHTML = acc || '<p class="scene">The sky was quiet — try again.</p>';
    paper.classList.remove('is-writing');
    status.textContent = 'done';
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
  if (status === 401) hint = ' — an access code is required (ACCESS_CODES is set on the server).';
  errBox.textContent = msg + hint;
  errBox.classList.add('is-on');
}

document.addEventListener('DOMContentLoaded', () => {
  bind('#rbClose', 'click', closeReader);
  bind('#rbRetry', 'click', retryBook);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ssReader').classList.contains('is-open')) closeReader();
  });
});
