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
  { id: 'sky',      label: 'Their sky',  hint: 'their real planets, behind the words' },
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
      if (_posterData) loadCompanions().then(reg => {
        const body = document.getElementById('ssPosterBody');
        if (body && body.firstChild) { body.innerHTML = renderPoster(_posterData, reg); wireCompanionFallback(_posterData); }
      });
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
  // mirrors /api/poster: seven for one, otherwise one each plus a few shared
  const perPerson = n === 1 ? 7 : (n === 2 ? 2 : 1);
  const shared = n > 1 ? (n <= 5 ? 3 : 2) : 0;
  const count = n > 1 ? n * perPerson + shared : 7;
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
let _skies = [];   // the real positions behind the poster, for the "their sky" style
let _people = []; // name + chart text per person, for the companion sheet

async function posterPeople() {
  const people = [{ name: state.name.trim() || 'the child', chart: state.chartText }];
  _people = people;
  _skies = state.skyPoints ? [state.skyPoints] : [];
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
      if (chart) {
        people.push({ name: p.name.trim(), chart });
        const sky = await skyPointsFor({ date: p.date, time: p.time, lat: p.lat, lon: p.lon });
        if (sky) _skies.push(sky);
      }
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
  const bh0 = document.getElementById('pbBehind');
  if (bh0) bh0.style.display = 'none';
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
    const bh = document.getElementById('pbBehind');
    if (bh) bh.style.display = data.behind ? '' : 'none';
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

// ── "their sky": the real chart drawn as a constellation ────────────────────
// Not a decorative star field — each dot is a body at its true ecliptic
// longitude, joined in order so a person's chart reads as their own figure.
// Several people overlay on concentric rings, which is what a family's skies
// literally look like laid over each other.
function skyBackdropSVG(skies) {
  const live = (skies || []).filter(s => s && s.points && s.points.length);
  if (!live.length) return '';
  const W = 600, H = 840, cx = W / 2, cy = H / 2;
  const outer = Math.min(W, H) * 0.42;
  const ring = live.length > 1 ? outer * 0.30 / live.length : 0;
  const pt = (lonDeg, r) => {
    const a = (lonDeg - 90) * Math.PI / 180; // 0° Aries at the left, rising anticlockwise
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  let out = '';
  // the ecliptic circle and the twelve sign divisions
  out += `<circle cx="${cx}" cy="${cy}" r="${outer.toFixed(1)}" fill="none" stroke="#c9a227" stroke-width="1" opacity="0.13"/>`;
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = pt(i * 30, outer * 0.955), [x2, y2] = pt(i * 30, outer);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c9a227" stroke-width="1" opacity="0.16"/>`;
  }
  live.forEach((s, i) => {
    const r = outer * 0.86 - i * ring;
    const pts = [...s.points].sort((a, b) => a.lon - b.lon);
    const xy = pts.map(p => pt(p.lon, r));
    // join this person's bodies into one closed figure — their constellation
    out += `<path d="M${xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z" fill="none" stroke="#2c2416" stroke-width="0.8" opacity="0.10"/>`;
    xy.forEach(([x, y], k) => {
      const big = pts[k].big;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 4.2 : 2.4}" fill="${big ? '#c9a227' : '#2c2416'}" opacity="${big ? 0.22 : 0.13}"/>`;
    });
    if (s.asc != null) {
      const [ax, ay] = pt(s.asc, outer);
      out += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3" fill="none" stroke="#1a9eae" stroke-width="1.2" opacity="0.22"/>`;
    }
  });
  return `<svg class="pc-sky" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out}</svg>`;
}

function companionFigure(data, reg) {
  if (_posterStyle === 'minimal' || _posterStyle === 'sky') return '';
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
  // the preview takes the chosen sheet's proportions, so a tall poster looks
  // tall on screen rather than being previewed as an A3
  const P = POSTER_SIZES.find(x => x.id === _posterSize) || POSTER_SIZES[1];
  return `<div class="pc-poster" style="--par:${(P.h / P.w).toFixed(4)}">
    ${_posterStyle === 'sky' ? skyBackdropSVG(_skies) : ''}
    <div class="pc-frame"></div>
    ${data.kicker ? `<div class="pc-kicker">${escHtml(data.kicker)}</div>` : ''}
    <h1 class="pc-title">${escHtml(data.title)}</h1>
    ${data.subtitle ? `<div class="pc-sub">${escHtml(data.subtitle)}</div>` : ''}
    ${companionFigure(data, reg)}
    <div class="pc-rules">${rulesHTML(data.rules)}</div>
    <div class="pc-foot">${data.mirror ? `<b>${escHtml(data.mirror)}</b><br>` : ''}Star Stories</div>
  </div>`;
}

// ── Print-ready download: a self-contained A3 poster document ────────────────
// Print CSS, generated for the chosen paper. A3 (297×420) is the poster size a
// print shop expects; A4 (210×297) is what most people can actually run at
// home. A4 is exactly A3 scaled by 1/√2, so every length is multiplied by k and
// the sheet is identical, just smaller.
let _posterSize = 'A3';

// The largest type that still fits the sheet. Replaces a hand-tuned curve that
// only ever suited A4/A3: a 40x120 sheet has a very tall, narrow column, and a
// fixed multiplier made its text tiny on a metre-long poster. This measures the
// actual geometry — column height and width, rule count, whether a centre motif
// is present — and picks the biggest scale that keeps the page at ~88% full.
function fitFor(P, n) {
  const mm = x => x * P.k;
  const usable = P.h - 2 * mm(30);
  const width = P.w - 2 * mm(26);
  const hasArt = !(_posterStyle === 'minimal' || _posterStyle === 'sky');
  const est = f => {
    const pt = x => x * P.k * f * 0.3528;          // pt -> mm
    const body = pt(15);
    const lines = Math.max(1, Math.ceil(95 * body * 0.5 / width)); // ~95 chars a rule
    const rule = lines * body * 1.5 + pt(10.5) * 1.2 + mm(1.4);
    const head = pt(10) + mm(5) + pt(34) * 1.12 + pt(12) + mm(4);
    const foot = pt(11) + mm(8);
    return (n * rule + (n - 1) * mm(5) * f + head + (hasArt ? mm(55) : 0) + foot) / usable;
  };
  let best = 0.6;
  for (let f = 0.6; f <= 4.0; f += 0.02) if (est(f) <= 0.88) best = f;
  return best;
}

function posterDocCSS(ruleCount = 6) {
  const P = POSTER_SIZES.find(x => x.id === _posterSize) || POSTER_SIZES[1];
  // Type scales with how much there is to fit, so the sheet is always about as
  // full as a poster should be. Previously it was set for the worst case and a
  // short compass left a third of the page empty. The relationship is very
  // nearly inverse — measured against the layout, ~8.4/n lands every rule count
  // at roughly 85% of the column, with the rules spreading over the remainder.
  const fit = fitFor(P, ruleCount);
  const mm = n => +(n * P.k).toFixed(2) + 'mm';
  const sm = n => +(n * P.k * fit).toFixed(2) + 'mm';   // spacing that breathes with the type
  const pt = n => +(n * P.k * fit).toFixed(2) + 'pt';
  // labels (kicker, footer) are not headlines — let them grow with the sheet
  // but not with the rule type, or a tall poster shouts its own small print
  const cap = n => +(n * P.k * Math.min(fit, 1.15)).toFixed(2) + 'pt';
  return `
@page{size:${P.w}mm ${P.h}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#4a4a5e;font-family:Georgia,'Times New Roman',serif}
.poster{width:${P.w}mm;height:${P.h}mm;margin:0 auto;background:#faf6ec;color:#2c2416;position:relative;padding:${mm(30)} ${mm(26)};display:flex;flex-direction:column;overflow:hidden}
.frame{position:absolute;inset:${mm(14)};border:1.5px solid #c9a227;border-radius:${mm(4)};pointer-events:none}
.frame:before{content:"";position:absolute;inset:${mm(3)};border:.6px solid #d9c98f;border-radius:${mm(3)}}
.kicker{text-align:center;letter-spacing:.24em;text-transform:uppercase;font-size:${cap(10)};color:#9a7010;margin-bottom:${mm(5)}}
h1{text-align:center;font-size:${pt(34)};font-weight:normal;letter-spacing:.04em;color:#2c2416;line-height:1.12}
.sub{text-align:center;font-size:${pt(12)};color:#8a7860;margin-top:${mm(4)};font-style:italic}
.avatar{display:block;width:${mm(44)};height:auto;margin:${mm(7)} auto ${mm(4)};filter:drop-shadow(0 8px 18px rgba(44,36,22,.25))}
.avatars{display:flex;justify-content:center;align-items:flex-end;gap:${mm(4)};margin:${mm(7)} auto ${mm(4)};flex-wrap:wrap}
.avatars img{width:${mm(26)};height:auto;filter:drop-shadow(0 6px 14px rgba(44,36,22,.22))}
.rules{margin:${mm(5)} auto 0;max-width:${mm(210)};width:100%;flex:1;display:flex;flex-direction:column;justify-content:space-evenly;gap:${sm(5)}}
.rule{display:flex;gap:${mm(6)};align-items:flex-start}
.rule .star{flex:0 0 auto;color:#c9a227;font-size:${pt(16)};line-height:1.4}
.rule p{font-size:${pt(15)};line-height:1.5;color:#3a3020}
.rule small{display:block;color:#87764f;font-size:${pt(10.5)};font-style:italic;margin-top:${mm(1.4)}}
.foot{margin-top:auto;text-align:center;color:#8a7860;font-style:italic;font-size:${cap(11)};padding-top:${mm(8)}}
.foot b{color:#9a7010;font-style:normal;letter-spacing:.05em}
.pc-sky{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
.poster>*:not(.pc-sky){position:relative;z-index:1}
`;
}

function posterAvatarForDoc(data, reg) {
  // 'sky' draws its figure as a backdrop, so it takes no centre motif either —
  // without this it fell through to the animals and printed the whole cast.
  if (_posterStyle === 'minimal' || _posterStyle === 'sky') return '';
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


// ── the sheet behind it ─────────────────────────────────────────────────────
// A separate A4 page for the grown reader: what in the real chart each rule
// came from, plus the computed placements. It belongs to the poster, not to the
// book — someone may own only this sheet and the wall piece.
const BEHIND_DOC_CSS = `
@page{size:210mm 297mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#4a4a5e;font-family:Georgia,'Times New Roman',serif}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#faf6ec;color:#2c2416;padding:22mm 20mm 18mm;position:relative}
.kicker{text-align:center;letter-spacing:.3em;text-transform:uppercase;font-size:8pt;color:#9a7010;margin-bottom:5mm}
h1{text-align:center;font-size:20pt;font-weight:normal;letter-spacing:.03em;line-height:1.2}
.lede{text-align:center;font-size:10pt;color:#8a7860;font-style:italic;margin:4mm auto 9mm;max-width:135mm;line-height:1.5}
.person{margin-bottom:7mm;padding-bottom:6mm;border-bottom:.4pt solid #e2d8bd}
.person:last-of-type{border-bottom:none}
.person h2{font-size:12pt;color:#9a7010;font-weight:normal;letter-spacing:.05em;margin-bottom:2.5mm}
.person p{font-size:10pt;line-height:1.62;color:#3a3020}
.chart{font-family:'Courier New',monospace;font-size:7.5pt;line-height:1.75;white-space:pre-wrap;
  background:#f4eeda;border:.4pt solid #e0d5bb;padding:3.5mm;margin-top:3mm;color:#5a4a30}
.shared{margin-top:2mm;padding:5mm 6mm;background:#f4eeda;border-left:2pt solid #c9a227}
.shared h2{font-size:11pt;color:#9a7010;font-weight:normal;letter-spacing:.05em;margin-bottom:2.5mm}
.shared p{font-size:10pt;line-height:1.62;color:#3a3020}
.key{margin-top:3mm;padding:4.5mm 5.5mm;border:.4pt solid #e0d5bb;background:#fdfaf1}
.key h2{font-size:10pt;color:#9a7010;font-weight:normal;letter-spacing:.05em;margin-bottom:2.5mm}
.key p{font-size:8.5pt;line-height:1.55;color:#5a4a30;margin-bottom:1mm}
.key b{color:#3a3020}
.person,.key,.shared{break-inside:avoid;page-break-inside:avoid}
.foot{margin-top:9mm;text-align:center;color:#8a7860;font-style:italic;font-size:9.5pt}
.foot b{color:#9a7010;font-style:normal;letter-spacing:.05em}
`;

// The chart summary is written for the model, not for a reader: it carries
// diagnostic shadow words, internal pointers and notes addressed to whoever
// filled the form. Strip all of that before it reaches a printed page.
function chartBlock(text) {
  return String(text || '').split('\n')
    .filter(l => l.trim() && !/NEVER print|Shadows \(/i.test(l))
    .map(l => l
      .replace(/\s*←[^\n]*/g, '')                              // "← recurring companion/talisman"
      .replace(/\s*\(Life Path from birth date only[^)]*\)/gi, '') // a note to the form-filler
      .replace(/\s*\(printable\)/gi, '')                        // internal labelling
      .trimEnd())
    .join('\n').trim();
}

// What the notation means. The placements are worth printing — they are the
// evidence behind each rule — but a page of "H7", "5/1" and "LW 55.5" with no
// key is a wall of code. This is the missing explanation.
const NOTATION_KEY = {
  English:    [['H1–H12', 'the twelve houses — which area of life a planet sits in'],
               ['ASC / MC', 'the rising sign (how they meet the world) and the midheaven'],
               ['Human Design', 'type · inner authority · profile (e.g. 4/6 — learns by trying, then teaches)'],
               ['Gene Keys', "LW Life's Work · Ev Evolution · Ra Radiance · Pu Purpose, each shown as gate.line"],
               ['Gifts', 'the name for what each of those four is at its best'],
               ['Life Path', 'a number from the birth date; 11, 22 and 33 are the master numbers']],
  Italian:    [['H1–H12', 'le dodici case — in quale area di vita si trova un pianeta'],
               ['ASC / MC', "l'Ascendente (come si presenta al mondo) e il Medio Cielo"],
               ['Human Design', 'tipo · autorità interiore · profilo (es. 4/6 — impara provando, poi insegna)'],
               ['Gene Keys', 'LW Lavoro di Vita · Ev Evoluzione · Ra Irradiazione · Pu Scopo, indicati come porta.linea'],
               ['Doni', 'il nome di ciascuno di quei quattro nella sua forma migliore'],
               ['Life Path', 'un numero dalla data di nascita; 11, 22 e 33 sono i numeri maestri']],
  Lithuanian: [['H1–H12', 'dvylika namų — kurioje gyvenimo srityje yra planeta'],
               ['ASC / MC', 'Ascendentas (kaip sutinka pasaulį) ir dangaus vidurys'],
               ['Human Design', 'tipas · vidinis autoritetas · profilis (pvz. 4/6 — mokosi bandydamas, paskui moko)'],
               ['Gene Keys', 'LW Gyvenimo darbas · Ev Evoliucija · Ra Spindesys · Pu Paskirtis, žymima vartai.linija'],
               ['Dovanos', 'kiekvieno iš tų keturių vardas geriausiu pavidalu'],
               ['Life Path', 'skaičius iš gimimo datos; 11, 22 ir 33 — meistrų skaičiai']],
  German:     [['H1–H12', 'die zwölf Häuser — in welchem Lebensbereich ein Planet steht'],
               ['ASC / MC', 'der Aszendent (wie sie der Welt begegnen) und der Medium Coeli'],
               ['Human Design', 'Typ · innere Autorität · Profil (z. B. 4/6 — lernt durch Versuchen, dann lehrt es)'],
               ['Gene Keys', 'LW Lebenswerk · Ev Evolution · Ra Ausstrahlung · Pu Bestimmung, als Tor.Linie'],
               ['Gaben', 'der Name für jede dieser vier in ihrer besten Form'],
               ['Life Path', 'eine Zahl aus dem Geburtsdatum; 11, 22 und 33 sind die Meisterzahlen']],
};

function posterLangName() {
  const NAMES = { LT: 'Lithuanian', IT: 'Italian', DE: 'German', EN: 'English' };
  return NAMES[(state.bookLangs && state.bookLangs[0]) || 'EN'] || 'English';
}

function behindDoc(d) {
  const b = d.behind;
  if (!b) return '';
  const key = NOTATION_KEY[posterLangName()] || NOTATION_KEY.English;
  const keyHTML = `<div class="key"><h2>${escHtml({
    Italian: 'Come leggere i dati', Lithuanian: 'Kaip skaityti duomenis',
    German: 'Wie die Angaben zu lesen sind', English: 'How to read the figures',
  }[posterLangName()] || 'How to read the figures')}</h2>` +
    key.map(([t, d2]) => `<p><b>${escHtml(t)}</b> — ${escHtml(d2)}</p>`).join('') + '</div>';
  const byName = new Map(_people.map(p => [p.name, p.chart]));
  const people = (b.people || []).map(x => `
  <div class="person">
    <h2>${escHtml(x.name)}</h2>
    <p>${escHtml(x.note)}</p>
    ${byName.get(x.name) ? `<div class="chart">${escHtml(chartBlock(byName.get(x.name)))}</div>` : ''}
  </div>`).join('');
  const title = b.title || d.title || 'The sky behind these rules';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escHtml(title)} — Star Stories</title><style>${BEHIND_DOC_CSS}</style></head>
<body><div class="sheet">
  ${d.kicker ? `<div class="kicker">${escHtml(d.kicker)}</div>` : ''}
  <h1>${escHtml(title)}</h1>
  ${d.subtitle ? `<div class="lede">${escHtml(d.subtitle)}</div>` : ''}
  ${people}
  ${keyHTML}
  ${b.shared ? `<div class="shared"><h2>${escHtml(d.family ? 'Together' : 'All of it together')}</h2><p>${escHtml(b.shared)}</p></div>` : ''}
  <div class="foot">${d.mirror ? `<b>${escHtml(d.mirror)}</b><br>` : ''}Star Stories</div>
</div></body></html>`;
}

async function downloadBehind() {
  if (!_posterData || !_posterData.behind) return;
  const doc = behindDoc(_posterData);
  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug(state.name || 'compass')}-the-sky-behind.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadPoster() {
  if (!_posterData) return;
  const reg = await loadCompanions();
  const d = _posterData;
  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escHtml(d.title)} — Star Stories</title><style>${posterDocCSS(d.rules.length)}</style></head>
<body><div class="poster">
  ${_posterStyle === 'sky' ? skyBackdropSVG(_skies) : ''}
  <div class="frame"></div>
  ${d.kicker ? `<div class="kicker">${escHtml(d.kicker)}</div>` : ''}
  <h1>${escHtml(d.title)}</h1>
  ${d.subtitle ? `<div class="sub">${escHtml(d.subtitle)}</div>` : ''}
  ${posterAvatarForDoc(d, reg)}
  <div class="rules">${d.rules.map(r => `<div class="rule"><span class="star">✦</span><p>${escHtml(r.text)}${r.source ? `<small>${escHtml(r.source)}</small>` : ''}</p></div>`).join('')}</div>
  ${d.mirror ? `<div class="foot"><b>${escHtml(d.mirror)}</b><br>Star Stories</div>` : '<div class="foot">Star Stories</div>'}
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
  bind('#pbBehind', 'click', downloadBehind);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('ssPoster').classList.contains('is-open')) closePoster();
  });
});
