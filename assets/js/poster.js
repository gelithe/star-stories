// Star Stories — the "little compass" poster add-on.
// Calls /api/poster for a handful of life-rules drawn from the child's real
// chart, lays them out as a printable A3 poster, and offers it as a download
// (open → Ctrl/Cmd-P → Save as PDF, same flow as the book export).
//
// Reuses escHtml() and slug() from bookexport.js, ART from illustrate.js, and
// the shared `state`.

let _posterData = null;
let _companionsCache = null;

// Load the companion registry once so the poster can show the child's avatar.
async function loadCompanions() {
  if (_companionsCache) return _companionsCache;
  try {
    const res = await fetch('assets/data/companions.json');
    _companionsCache = await res.json();
  } catch { _companionsCache = { companions: [] }; }
  return _companionsCache;
}

function companionSheet(reg, animal) {
  const c = (reg.companions || []).find(x => x.animal === animal);
  return c && c.assets && c.assets.sheet ? c.assets.sheet : '';
}

// ── family compass: extra people, each with their own computed chart ────────
// They share the birthplace from the main form (siblings usually do, and the
// place only affects the rising sign); name + date are what matter.
let _family = []; // [{ name, date, time }]

function renderFamilyRows() {
  const wrap = document.getElementById('ssFamilyRows');
  if (!wrap) return;
  wrap.innerHTML = _family.map((p, i) => `
    <div class="ss-family-row" data-i="${i}">
      <input class="ss-input" data-f="name" type="text" placeholder="Name" value="${escHtml(p.name)}">
      <input class="ss-input" data-f="date" type="date" value="${escHtml(p.date)}">
      <input class="ss-input" data-f="time" type="time" value="${escHtml(p.time)}">
      <button class="ss-family-del" type="button" data-del="${i}" aria-label="Remove">×</button>
    </div>`).join('');
  wrap.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => {
      const row = e.target.closest('.ss-family-row');
      _family[+row.dataset.i][e.target.dataset.f] = e.target.value;
    });
  });
  wrap.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => { _family.splice(+b.dataset.del, 1); renderFamilyRows(); });
  });
}

function addFamilyMember() {
  if (_family.length >= 5) return; // the server caps at 6 people including the child
  _family.push({ name: '', date: '', time: '' });
  renderFamilyRows();
}

// Build people[] — the child first, then any family member with a name+date,
// each with their own chart computed through the same engine.
async function posterPeople() {
  const people = [{ name: state.name.trim() || 'the child', chart: state.chartText }];
  for (const p of _family) {
    if (!p.name.trim() || !p.date) continue;
    try {
      const chart = await chartSummaryFor({ name: p.name.trim(), date: p.date, time: p.time, lat: state.lat, lon: state.lon });
      if (chart) people.push({ name: p.name.trim(), chart });
    } catch { /* skip a member whose sky can't be read rather than fail the poster */ }
  }
  return people;
}

async function posterPayload() {
  return {
    people: await posterPeople(),
    birth: { name: state.name.trim(), date: state.birthDate, place: state.place },
    languages: state.bookLangs,
    parentsLang: state.parentsLang,
    accessCode: state.accessCode || undefined,
  };
}

async function openPoster() {
  const note = document.getElementById('ssCreateNote');
  if (!state.name.trim() || !state.chartText) {
    if (!state.chartText && state.birthDate) { if (note) { note.className = 'ss-create-note'; note.textContent = 'Reading the sky…'; } await computeAndPreview(); }
    if (!state.name.trim() || !state.chartText) {
      if (note) { note.className = 'ss-create-note is-warn'; note.textContent = 'Add the child’s name and birth date first, then make the poster.'; }
      return;
    }
  }
  if (note) { note.className = 'ss-create-note'; note.textContent = ''; }

  const overlay = document.getElementById('ssPoster');
  const bodyEl = document.getElementById('ssPosterBody');
  const status = document.getElementById('pbStatus');
  const errBox = document.getElementById('pbError');
  const dl = document.getElementById('pbDownload');
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  errBox.classList.remove('is-on'); errBox.textContent = '';
  bodyEl.innerHTML = '';
  if (dl) dl.style.display = 'none';
  status.textContent = 'reading the sky…';

  try {
    const payload = await posterPayload(); // computes each family member's chart
    if (payload.people.length > 1) status.textContent = `reading ${payload.people.length} skies…`;
    const [reg, res] = await Promise.all([
      loadCompanions(),
      fetch('/api/poster', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ]);
    if (!res.ok) {
      let msg = `Poster failed (HTTP ${res.status}).`;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
      if (res.status === 500) msg += ' — the server is missing ANTHROPIC_API_KEY.';
      if (res.status === 401) msg += ' — enter your Access code in the form and try again.';
      showPosterError(msg); return;
    }
    const data = await res.json();
    _posterData = data;
    bodyEl.innerHTML = renderPoster(data, reg);
    wireCompanionFallback(data);
    status.textContent = 'ready to print';
    if (dl) dl.style.display = '';
  } catch (e) {
    showPosterError('Network error while writing the poster — please retry.');
  }
}

function closePoster() {
  document.getElementById('ssPoster').classList.remove('is-open');
  document.body.style.overflow = '';
}

function showPosterError(msg) {
  document.getElementById('pbStatus').textContent = '';
  const b = document.getElementById('pbError');
  b.textContent = msg; b.classList.add('is-on');
}

function posterElement(data) {
  return (data.companion && data.companion.element) || (typeof state !== 'undefined' && state.element) || 'Water';
}
function vectorCompanion(el) {
  const vec = (typeof ART !== 'undefined' && ART.motifSVG) ? ART.motifSVG('companion', el) : '';
  return vec ? `<div class="pc-avatar pc-vec">${vec}</div>` : '';
}

// The companion figure: the registered painted avatar if we have one, else the
// house-style vector companion so the poster is never empty. If the CDN image
// fails to load, wireCompanionFallback() swaps in the vector (done in JS to
// avoid quoting an SVG inside an HTML attribute).
function companionFigure(data, reg) {
  // A family poster shows EVERY companion, so no one person's animal stands in
  // for the household. If any sheet is missing we fall back to the single
  // abstract vector rather than showing a partial cast.
  const all = Array.isArray(data.companions) ? data.companions : [];
  if (data.family && all.length > 1) {
    const sheets = all.map(c => ({ c, url: companionSheet(reg, c.animal) }));
    if (sheets.every(s => s.url)) {
      // Labelled by Chinese sign, not by the books' character names — a poster
      // is often bought on its own and must make sense without them.
      return `<div class="pc-avatars">${sheets.map(s =>
        `<img src="${escHtml(s.url)}" alt="${escHtml(s.c.element + ' ' + s.c.animal)}" title="${escHtml(s.c.person + ' · ' + s.c.element + ' ' + s.c.animal)}">`
      ).join('')}</div>`;
    }
    return vectorCompanion(posterElement(data));
  }
  const solo = data.companion || all[0];
  const sheet = solo ? companionSheet(reg, solo.animal) : '';
  if (sheet) {
    return `<img class="pc-avatar" id="pcAvatar" src="${escHtml(sheet)}" alt="${escHtml(solo.element + ' ' + solo.animal)}">`;
  }
  return vectorCompanion(posterElement(data));
}
function wireCompanionFallback(data) {
  const img = document.getElementById('pcAvatar');
  if (!img) return;
  img.onerror = () => { img.outerHTML = vectorCompanion(posterElement(data)); };
}

function rulesHTML(rules) {
  return rules.map(r =>
    `<div class="pc-rule"><span class="pc-star">✦</span><p>${escHtml(r.text)}${r.source ? `<small>${escHtml(r.source)}</small>` : ''}</p></div>`
  ).join('');
}

function renderPoster(data, reg) {
  return `<div class="pc-poster">
    <div class="pc-frame"></div>
    ${data.kicker ? `<div class="pc-kicker">${escHtml(data.kicker)}</div>` : ''}
    <h1 class="pc-title">${escHtml(data.title)}</h1>
    ${data.subtitle ? `<div class="pc-sub">${escHtml(data.subtitle)}</div>` : ''}
    ${companionFigure(data, reg)}
    <div class="pc-rules">${rulesHTML(data.rules)}</div>
    <div class="pc-foot"><b>${escHtml(data.mirror)}</b><br>Star Stories</div>
  </div>`;
}

// ── Print-ready download: a self-contained A3 poster document ────────────────
const POSTER_DOC_CSS = `
@page{size:297mm 420mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#4a4a5e;font-family:Georgia,'Times New Roman',serif}
.poster{width:297mm;height:420mm;margin:0 auto;background:#faf6ec;color:#2c2416;position:relative;padding:30mm 26mm;display:flex;flex-direction:column;overflow:hidden}
.frame{position:absolute;inset:14mm;border:1.5px solid #c9a227;border-radius:4mm;pointer-events:none}
.frame:before{content:"";position:absolute;inset:3mm;border:.6px solid #d9c98f;border-radius:3mm}
.kicker{text-align:center;letter-spacing:.32em;text-transform:uppercase;font-size:10pt;color:#9a7010;margin-bottom:5mm}
h1{text-align:center;font-size:34pt;font-weight:normal;letter-spacing:.04em;color:#2c2416;line-height:1.12}
.sub{text-align:center;font-size:11pt;color:#8a7860;margin-top:4mm;font-style:italic}
.avatar{display:block;width:44mm;height:auto;margin:7mm auto 4mm;filter:drop-shadow(0 8px 18px rgba(44,36,22,.25))}
.avatars{display:flex;justify-content:center;align-items:flex-end;gap:4mm;margin:7mm auto 4mm;flex-wrap:wrap}
.avatars img{width:26mm;height:auto;filter:drop-shadow(0 6px 14px rgba(44,36,22,.22))}
.rules{margin:5mm auto 0;max-width:210mm;display:flex;flex-direction:column;gap:5mm}
.rule{display:flex;gap:6mm;align-items:flex-start}
.rule .star{flex:0 0 auto;color:#c9a227;font-size:15pt;line-height:1.4}
.rule p{font-size:13.5pt;line-height:1.5;color:#3a3020}
.rule small{display:block;color:#9a8a6a;font-size:9.5pt;font-style:italic;margin-top:1mm}
.foot{margin-top:auto;text-align:center;color:#8a7860;font-style:italic;font-size:11pt;padding-top:8mm}
.foot b{color:#9a7010;font-style:normal;letter-spacing:.05em}
`;

function posterAvatarForDoc(data, reg) {
  const all = Array.isArray(data.companions) ? data.companions : [];
  if (data.family && all.length > 1) {
    const urls = all.map(c => companionSheet(reg, c.animal));
    if (urls.every(Boolean)) {
      return `<div class="avatars">${urls.map(u => `<img src="${escHtml(u)}" alt="">`).join('')}</div>`;
    }
  } else {
    const solo = data.companion || all[0];
    const sheet = solo ? companionSheet(reg, solo.animal) : '';
    if (sheet) return `<img class="avatar" src="${escHtml(sheet)}" alt="">`;
  }
  const vec = (typeof ART !== 'undefined' && ART.motifSVG) ? ART.motifSVG('companion', posterElement(data)) : '';
  return vec ? `<div class="avatar">${vec}</div>` : '';
}

async function downloadPoster() {
  if (!_posterData) return;
  const reg = await loadCompanions();
  const d = _posterData;
  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escHtml(d.title)} — Star Stories</title><style>${POSTER_DOC_CSS}</style></head>
<body><div class="poster">
  <div class="frame"></div>
  ${d.kicker ? `<div class="kicker">${escHtml(d.kicker)}</div>` : ''}
  <h1>${escHtml(d.title)}</h1>
  ${d.subtitle ? `<div class="sub">${escHtml(d.subtitle)}</div>` : ''}
  ${posterAvatarForDoc(d, reg)}
  <div class="rules">${d.rules.map(r => `<div class="rule"><span class="star">✦</span><p>${escHtml(r.text)}${r.source ? `<small>${escHtml(r.source)}</small>` : ''}</p></div>`).join('')}</div>
  <div class="foot"><b>${escHtml(d.mirror)}</b><br>Star Stories</div>
</div></body></html>`;

  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug(state.name || 'compass')}-little-compass.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  bind('#ssPosterBtn', 'click', openPoster);
  bind('#ssFamilyToggle', 'click', () => {
    const box = document.getElementById('ssFamily');
    const on = box.style.display === 'none';
    box.style.display = on ? '' : 'none';
    document.getElementById('ssFamilyToggle').textContent = on ? '– just this child' : '+ make it a family compass';
    if (on && !_family.length) addFamilyMember();
  });
  bind('#ssFamilyAdd', 'click', addFamilyMember);
  bind('#pbClose', 'click', closePoster);
  bind('#pbRetry', 'click', openPoster);
  bind('#pbDownload', 'click', downloadPoster);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ssPoster').classList.contains('is-open')) closePoster();
  });
});
