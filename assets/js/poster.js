// Star Stories — the "little compass" poster add-on.
// Calls /api/poster for a handful of life-rules drawn from the child's real
// chart, lays them out as a printable A3 poster, and offers it as a download
// (open → Ctrl/Cmd-P → Save as PDF, same flow as the book export).
//
// Reuses escHtml() and slug() from bookexport.js, ART from illustrate.js, and
// the shared `state`.

let _posterData = null;
let _companionsCache = null;

// ── poster style ────────────────────────────────────────────────────────────
// A poster hangs in someone's home, so the art has to suit the room. Abstract
// is the default: the house-style vector, which sits quietly in any interior.
const POSTER_STYLES = [
  { id: 'abstract', label: 'Abstract',  hint: 'the house mark, quiet in any room' },
  { id: 'nature',   label: 'Nature',    hint: 'a landscape in the chart’s element' },
  { id: 'animals',  label: 'Animals',   hint: 'the drawn zodiac creatures' },
  { id: 'minimal',  label: 'Words only', hint: 'no picture at all' },
];
let _posterStyle = 'abstract';

// Paper. `k` scales every length and type size off the A3 layout, so each size
// is the same sheet redrawn rather than a different design. `tall` formats are
// narrower than A-series and take the type down a touch more so lines still
// break well in a slim column.
const POSTER_SIZES = [
  { id: 'A4',    label: 'A4',      hint: '210×297 — prints at home',  w: 210, h: 297, k: 210 / 297 },
  { id: 'A3',    label: 'A3',      hint: '297×420 — a print shop',    w: 297, h: 420, k: 1 },
  { id: 'A2',    label: 'A2',      hint: '420×594 — a big wall',      w: 420, h: 594, k: 420 / 297 },
  { id: '50x70', label: '50×70',   hint: 'the standard frame size',   w: 500, h: 700, k: 500 / 297 },
  { id: 'tall',  label: 'Tall',    hint: '40×120 — a long vertical',  w: 400, h: 1200, k: 400 / 297, tall: true },
];

function renderPosterSizes() {
  const wrap = document.getElementById('posterSize');
  if (!wrap) return;
  wrap.innerHTML = POSTER_SIZES.map(s => `
    <button type="button" class="ss-chip${s.id === _posterSize ? ' is-on' : ''}" data-psize="${s.id}">
      <span class="ss-chip-t">${s.label}</span>
      <span class="ss-chip-s">${s.hint}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-psize]').forEach(btn =>
    btn.addEventListener('click', () => {
      _posterSize = btn.dataset.psize;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.psize === _posterSize));
      updatePosterSummary();
    }));
}

function renderPosterStyles() {
  const wrap = document.getElementById('posterStyle');
  if (!wrap) return;
  wrap.innerHTML = POSTER_STYLES.map(s => `
    <button type="button" class="ss-chip${s.id === _posterStyle ? ' is-on' : ''}" data-pstyle="${s.id}">
      <span class="ss-chip-t">${s.label}</span>
      <span class="ss-chip-s">${s.hint}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-pstyle]').forEach(btn =>
    btn.addEventListener('click', () => {
      _posterStyle = btn.dataset.pstyle;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.pstyle === _posterStyle));
      updatePosterSummary();
      // restyle in place if a poster is already on screen
      if (_posterData) loadCompanions().then(reg => {
        const body = document.getElementById('ssPosterBody');
        if (body && body.firstChild) { body.innerHTML = renderPoster(_posterData, reg); wireCompanionFallback(_posterData); }
      });
    }));
}

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
// Each member carries their OWN birthplace: a family can be born in Mexico,
// Australia and Germany, and the birthplace sets the UTC conversion, so a
// shared place would compute the wrong sky (not merely the wrong rising sign).
let _family = []; // [{ name, date, time, place, lat, lon, geo }]
const _geoTimers = {};

function familyRowHTML(p, i) {
  const geo = p.geo === 'ok' ? `<span class="ss-geo ok">✓ ${escHtml(p.placeLabel || '')}</span>`
    : p.geo === 'busy' ? '<span class="ss-geo">finding…</span>'
    : p.geo === 'fail' ? '<span class="ss-geo warn">place not found — the sky needs it</span>'
    : '';
  return `
    <div class="ss-family-row" data-i="${i}">
      <input class="ss-input" data-f="name" type="text" placeholder="Name" value="${escHtml(p.name)}">
      <input class="ss-input" data-f="date" type="date" value="${escHtml(p.date)}">
      <input class="ss-input" data-f="time" type="time" value="${escHtml(p.time)}">
      <button class="ss-family-del" type="button" data-del="${i}" aria-label="Remove">×</button>
      <input class="ss-input ss-family-place" data-f="place" type="text" placeholder="Birthplace — city, country" value="${escHtml(p.place || '')}">
      ${geo}
    </div>`;
}

function renderFamilyRows() {
  const wrap = document.getElementById('ssFamilyRows');
  if (!wrap) return;
  wrap.innerHTML = _family.map(familyRowHTML).join('');
  wrap.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.closest('.ss-family-row').dataset.i;
      const f = e.target.dataset.f;
      _family[i][f] = e.target.value;
      if (f === 'place') resolveFamilyPlace(i);
      updatePosterSummary();
    });
  });
  wrap.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => { _family.splice(+b.dataset.del, 1); renderFamilyRows(); updatePosterSummary(); });
  });
}

// Geocode one member's birthplace, debounced, without re-rendering the row the
// user is typing in (that would steal focus) — only its status chip.
function resolveFamilyPlace(i) {
  const p = _family[i];
  p.lat = p.lon = null;
  p.geo = p.place && p.place.trim().length >= 2 ? 'busy' : '';
  paintGeoStatus(i);
  clearTimeout(_geoTimers[i]);
  if (!p.geo) return;
  _geoTimers[i] = setTimeout(async () => {
    const asked = p.place;
    const hit = await geocodeOne(asked);
    if (_family[i] !== p || p.place !== asked) return; // typed on, or row removed
    if (hit) { p.lat = hit.lat; p.lon = hit.lon; p.placeLabel = hit.label; p.geo = 'ok'; }
    else { p.geo = 'fail'; }
    paintGeoStatus(i);
  }, 600);
}

function paintGeoStatus(i) {
  const row = document.querySelector(`.ss-family-row[data-i="${i}"]`);
  if (!row) return;
  const old = row.querySelector('.ss-geo');
  if (old) old.remove();
  const p = _family[i];
  if (!p.geo) return;
  const span = document.createElement('span');
  span.className = 'ss-geo' + (p.geo === 'ok' ? ' ok' : p.geo === 'fail' ? ' warn' : '');
  span.textContent = p.geo === 'ok' ? `✓ ${p.placeLabel || ''}`
    : p.geo === 'busy' ? 'finding…' : 'place not found — the sky needs it';
  row.appendChild(span);
}

// A short read-out beside the button, so the compass view has the same "here is
// what you'll get" as the book's summary card.
function updatePosterSummary() {
  const el = document.getElementById('ssPosterSummary');
  if (!el) return;
  const named = _family.filter(p => p.name.trim() && p.date).map(p => p.name.trim());
  const who = [state.name.trim() || '—', ...named];
  const n = who.length;
  const perPerson = n > 1 ? (n <= 4 ? 2 : 1) : 6;
  const shared = n > 1 ? (n <= 4 ? 2 : 3) : 0;
  const count = n > 1 ? n * perPerson + shared : 6;
  const size = POSTER_SIZES.find(s => s.id === _posterSize) || POSTER_SIZES[1];
  const style = POSTER_STYLES.find(s => s.id === _posterStyle) || POSTER_STYLES[0];
  el.innerHTML = `
    <div><span>For</span><strong>${escHtml(who.join(', '))}</strong></div>
    <div><span>Rules</span><strong>${count}${n > 1 ? ` — ${perPerson} each, ${shared} shared` : ''}</strong></div>
    <div><span>Paper</span><strong>${escHtml(size.label)}</strong></div>
    <div><span>Style</span><strong>${escHtml(style.label)}</strong></div>`;
}

function addFamilyMember() {
  if (_family.length >= 5) return; // the server caps at 6 people including the child
  _family.push({ name: '', date: '', time: '', place: '', lat: null, lon: null, geo: '' });
  renderFamilyRows();
  updatePosterSummary();
}

// Build people[] — the child first, then any family member with a name+date,
// each with their own chart computed through the same engine.
async function posterPeople() {
  const people = [{ name: state.name.trim() || 'the child', chart: state.chartText }];
  for (const p of _family) {
    if (!p.name.trim() || !p.date) continue;
    // Their own birthplace. If it hasn't resolved yet, try once now rather than
    // silently borrowing someone else's city — that would compute a false sky.
    if (p.lat == null && p.place && p.place.trim()) {
      const hit = await geocodeOne(p.place);
      if (hit) { p.lat = hit.lat; p.lon = hit.lon; p.placeLabel = hit.label; p.geo = 'ok'; paintGeoStatus(_family.indexOf(p)); }
    }
    try {
      const chart = await chartSummaryFor({ name: p.name.trim(), date: p.date, time: p.time, lat: p.lat, lon: p.lon });
      if (chart) people.push({ name: p.name.trim(), chart });
    } catch { /* skip a member whose sky can't be read rather than fail the poster */ }
  }
  return people;
}

async function posterPayload() {
  return {
    people: await posterPeople(),
    birth: { name: state.name.trim(), date: state.birthDate, place: state.place },
    home: (state.homeCity || '').trim(), // where the poster will actually hang
    languages: state.bookLangs,
    parentsLang: state.parentsLang,
    accessCode: state.accessCode || undefined,
  };
}

const POSTER_NOTE_DEFAULT = 'Printable A4 or A3; download and print at home or at a shop.';

async function openPoster() {
  // The compass has its own note line — the book's is on a card that is hidden
  // in this view, so a warning written there would never be seen.
  const note = document.getElementById('ssPosterNote');
  const say = (msg, warn) => { if (note) { note.className = 'ss-create-note' + (warn ? ' is-warn' : ''); note.textContent = msg; } };
  if (!state.name.trim() || !state.chartText) {
    if (!state.chartText && state.birthDate) { say('Reading the sky…'); await computeAndPreview(); }
    if (!state.name.trim() || !state.chartText) {
      say('Add the name and birth date first, then make the poster.', true);
      return;
    }
  }
  say(POSTER_NOTE_DEFAULT);

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
// Nature shouldn't always be the same mountain — pick the landscape from the
// element (which may be a Chinese element or an astrological one).
const NATURE_MOTIF = {
  Wood: 'forest', Fire: 'sun', Earth: 'mountain', Metal: 'sky', Water: 'sea', Air: 'sky',
};
function posterMotif(data) {
  if (_posterStyle === 'nature') return NATURE_MOTIF[posterElement(data)] || 'mountain-sea';
  return 'abstract';
}

function companionFigure(data, reg) {
  if (_posterStyle === 'minimal') return '';
  if (_posterStyle === 'abstract' || _posterStyle === 'nature') {
    const vec = (typeof ART !== 'undefined' && ART.motifSVG) ? ART.motifSVG(posterMotif(data), posterElement(data)) : '';
    return vec ? `<div class="pc-avatar pc-vec">${vec}</div>` : '';
  }
  // 'animals' — the drawn zodiac creatures.
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
// Print CSS, generated for the chosen paper. A3 (297×420) is the poster size a
// print shop expects; A4 (210×297) is what most people can actually run at
// home. A4 is exactly A3 scaled by 1/√2, so every length is multiplied by k and
// the sheet is identical, just smaller.
let _posterSize = 'A3';

function posterDocCSS(ruleCount = 6) {
  const P = POSTER_SIZES.find(x => x.id === _posterSize) || POSTER_SIZES[1];
  // Type scales with how much there is to fit, so the sheet is always about as
  // full as a poster should be. Previously it was set for the worst case and a
  // short compass left a third of the page empty. The relationship is very
  // nearly inverse — measured against the layout, ~8.4/n lands every rule count
  // at roughly 85% of the column, with the rules spreading over the remainder.
  const fit = Math.max(0.94, Math.min(1.45, 8.0 / Math.max(1, ruleCount))) * (P.tall ? 0.78 : 1);
  const mm = n => +(n * P.k).toFixed(2) + 'mm';
  const sm = n => +(n * P.k * fit).toFixed(2) + 'mm';   // spacing that breathes with the type
  const pt = n => +(n * P.k * fit).toFixed(2) + 'pt';
  return `
@page{size:${P.w}mm ${P.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#4a4a5e;font-family:Georgia,'Times New Roman',serif}
.poster{width:${P.w}mm;height:${P.h}mm;margin:0 auto;background:#faf6ec;color:#2c2416;position:relative;padding:${mm(30)} ${mm(26)};display:flex;flex-direction:column;overflow:hidden}
.frame{position:absolute;inset:${mm(14)};border:1.5px solid #c9a227;border-radius:${mm(4)};pointer-events:none}
.frame:before{content:"";position:absolute;inset:${mm(3)};border:.6px solid #d9c98f;border-radius:${mm(3)}}
.kicker{text-align:center;letter-spacing:.32em;text-transform:uppercase;font-size:${pt(10)};color:#9a7010;margin-bottom:${mm(5)}}
h1{text-align:center;font-size:${pt(34)};font-weight:normal;letter-spacing:.04em;color:#2c2416;line-height:1.12}
.sub{text-align:center;font-size:${pt(12)};color:#8a7860;margin-top:${mm(4)};font-style:italic}
.avatar{display:block;width:${mm(44)};height:auto;margin:${mm(7)} auto ${mm(4)};filter:drop-shadow(0 8px 18px rgba(44,36,22,.25))}
.avatars{display:flex;justify-content:center;align-items:flex-end;gap:${mm(4)};margin:${mm(7)} auto ${mm(4)};flex-wrap:wrap}
.avatars img{width:${mm(26)};height:auto;filter:drop-shadow(0 6px 14px rgba(44,36,22,.22))}
.rules{margin:${mm(5)} auto 0;max-width:${mm(210)};width:100%;flex:1;display:flex;flex-direction:column;justify-content:space-evenly;gap:${sm(5)}}
.rule{display:flex;gap:${mm(6)};align-items:flex-start}
.rule .star{flex:0 0 auto;color:#c9a227;font-size:${pt(16)};line-height:1.4}
.rule p{font-size:${pt(15)};line-height:1.5;color:#3a3020}
.rule small{display:block;color:#87764f;font-size:${pt(13.5)};font-style:italic;margin-top:${mm(1.4)}}
.foot{margin-top:auto;text-align:center;color:#8a7860;font-style:italic;font-size:${pt(11)};padding-top:${mm(8)}}
.foot b{color:#9a7010;font-style:normal;letter-spacing:.05em}
`;
}

function posterAvatarForDoc(data, reg) {
  if (_posterStyle === 'minimal') return '';
  if (_posterStyle === 'abstract' || _posterStyle === 'nature') {
    const vec = (typeof ART !== 'undefined' && ART.motifSVG) ? ART.motifSVG(posterMotif(data), posterElement(data)) : '';
    return vec ? `<div class="avatar">${vec}</div>` : '';
  }
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
<title>${escHtml(d.title)} — Star Stories</title><style>${posterDocCSS(d.rules.length)}</style></head>
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
  // Restore the family and the poster choices from the saved draft (read by
  // configurator.js, which boots first) so a refresh doesn't cost five people.
  const draft = window.__ssDraft;
  if (draft) {
    if (Array.isArray(draft.family) && draft.family.length) {
      _family = draft.family;
      renderFamilyRows();
      const box = document.getElementById('ssFamily');
      const tog = document.getElementById('ssFamilyToggle');
      if (box) box.style.display = '';
      if (tog) tog.textContent = '– just this child';
    }
    if (draft.posterStyle) _posterStyle = draft.posterStyle;
    if (draft.posterSize) _posterSize = draft.posterSize;
  }
  renderPosterStyles();
  renderPosterSizes();
  updatePosterSummary();
  // the child's name/date live in the shared form, so refresh on any edit there
  document.addEventListener('input', updatePosterSummary, true);
  bind('#pbClose', 'click', closePoster);
  bind('#pbRetry', 'click', openPoster);
  bind('#pbDownload', 'click', downloadPoster);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ssPoster').classList.contains('is-open')) closePoster();
  });
});
