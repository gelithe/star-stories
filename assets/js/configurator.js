// Star Stories — configurator orchestration.
// Wires the birth-data form to the browser engine and renders the instant
// "his sky" preview. Geocoding (Nominatim) and timezone (Open-Meteo) patterns
// are ported from the proven Chart Compass app.

const state = {
  name: '',
  fullName: '',             // optional — unlocks name-based numerology
  artStyle: 'vector',       // vector (house style) | painted (rendered, opt-in)
  element: 'Water',         // set from the chart; tints the illustrations
  birthDate: '',
  birthTime: '',
  place: '',
  lat: null,
  lon: null,
  tz: null,
  age: '6-8',
  bookLangs: ['LT', 'IT', 'DE'],
  parentsLang: 'IT',
  form: 'prose',            // adult editions: prose | poem | letter
  inputMode: 'surprise',    // surprise | details | theme
  details: { crew: '', familyWords: '', treasure: '' },
  theme: '',
  accessCode: '',           // only used while ACCESS_CODES gates the server
  // filled by computeAndPreview once a chart exists:
  chartText: '', hasTime: false, hasPlace: false,
};

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderAgeBands();
  renderForms();
  renderStoryShape();
  renderArtStyle();
  renderBookLanguages();
  renderParentsLanguages();

  bind('#fName', 'input', e => { state.name = e.target.value; schedulePreview(); });
  bind('#fFullName', 'input', e => { state.fullName = e.target.value; schedulePreview(); });
  bind('#fDate', 'change', e => { state.birthDate = e.target.value; schedulePreview(); });
  bind('#fTime', 'change', e => { state.birthTime = e.target.value; schedulePreview(); });

  const place = document.getElementById('fPlace');
  place.addEventListener('input', () => { state.place = place.value; onPlaceInput(place); });
  place.addEventListener('blur', () => setTimeout(hidePlaceSuggestions, 150));

  bind('#fAccess', 'input', e => state.accessCode = e.target.value.trim());
  bind('#ssCreate', 'click', onCreate);

  syncMixShape();
  updateSummary();
});

function bind(sel, ev, fn) { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); }

// ─── AGE BANDS ───────────────────────────────────────────────────────────────
function renderAgeBands() {
  const wrap = document.getElementById('ageBands');
  wrap.innerHTML = AGE_BANDS.map(b => `
    <button type="button" class="ss-chip${b.id === state.age ? ' is-on' : ''}" data-age="${b.id}">
      <span class="ss-chip-t">${b.label}</span>
      <span class="ss-chip-s">${b.reader}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-age]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.age = btn.dataset.age;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.age === state.age));
      syncMixShape();
      updateSummary();
    }));
}

function currentBand() { return AGE_BANDS.find(b => b.id === state.age) || AGE_BANDS[2]; }

function syncMixShape() {
  const band = currentBand();
  document.getElementById('ageRegister').textContent = band.register;
  const names = state.bookLangs.map(c => (BOOK_LANGUAGES.find(l => l.code === c) || {}).name).filter(Boolean);
  document.getElementById('mixShape').textContent = mixingShapeText(band, state.bookLangs.length, names);
  const formRow = document.getElementById('formRow');
  if (formRow) formRow.style.display = band.forms ? '' : 'none';
}

// ─── FORM (adult editions: prose / poem / letter) ────────────────────────────
function renderForms() {
  const wrap = document.getElementById('formChips');
  if (!wrap) return;
  wrap.innerHTML = FORMS.map(f => `
    <button type="button" class="ss-chip${f.id === state.form ? ' is-on' : ''}" data-form="${f.id}">
      <span class="ss-chip-t">${f.label}</span>
      <span class="ss-chip-s">${f.hint}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-form]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.form = btn.dataset.form;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.form === state.form));
    }));
}

// ─── STORY SHAPE (surprise / details / theme) ────────────────────────────────
const SHAPE_MODES = [
  { id: 'surprise', label: 'Surprise me', hint: 'shaped purely from the sky' },
  { id: 'details',  label: 'A few details', hint: 'add the crew, family words' },
  { id: 'theme',    label: 'Choose a theme', hint: 'a world you pick' },
];
function renderStoryShape() {
  const wrap = document.getElementById('shapeChips');
  if (!wrap) return;
  wrap.innerHTML = SHAPE_MODES.map(m => `
    <button type="button" class="ss-chip${m.id === state.inputMode ? ' is-on' : ''}" data-mode="${m.id}">
      <span class="ss-chip-t">${m.label}</span>
      <span class="ss-chip-s">${m.hint}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-mode]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.inputMode = btn.dataset.mode;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.mode === state.inputMode));
      syncShapeFields();
    }));
  bind('#dCrew', 'input', e => state.details.crew = e.target.value);
  bind('#dWords', 'input', e => state.details.familyWords = e.target.value);
  bind('#dTreasure', 'input', e => state.details.treasure = e.target.value);
  bind('#fTheme', 'input', e => state.theme = e.target.value);
  syncShapeFields();
}
function syncShapeFields() {
  const d = document.getElementById('detailsFields');
  const t = document.getElementById('themeField');
  if (d) d.style.display = state.inputMode === 'details' ? '' : 'none';
  if (t) t.style.display = state.inputMode === 'theme' ? '' : 'none';
}

// ─── LANGUAGES ───────────────────────────────────────────────────────────────
function renderBookLanguages() {
  const wrap = document.getElementById('bookLangs');
  wrap.innerHTML = BOOK_LANGUAGES.map(l => `
    <label class="ss-lang">
      <input type="checkbox" value="${l.code}" ${state.bookLangs.includes(l.code) ? 'checked' : ''}>
      <span class="ss-lang-code">${l.code}</span>
      <span class="ss-lang-name">${l.name}</span>
    </label>`).join('');
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => {
      if (cb.checked && state.bookLangs.length >= 4) { cb.checked = false; flash('#langNote'); return; }
      state.bookLangs = [...wrap.querySelectorAll('input:checked')].map(i => i.value);
      syncMixShape(); // the wording depends on how many languages are chosen
      updateSummary();
    }));
}

function renderParentsLanguages() {
  const sel = document.getElementById('parentsLang');
  sel.innerHTML = PARENTS_LANGUAGES.map(l =>
    `<option value="${l.code}" ${l.code === state.parentsLang ? 'selected' : ''}>${l.name}</option>`).join('');
  sel.addEventListener('change', () => { state.parentsLang = sel.value; updateSummary(); });
}

function flash(sel) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), 900);
}

// ─── PLACE AUTOCOMPLETE (ported from Chart Compass) ─────────────────────────
let _placeTimer = null;
let _placeSuggestions = [];

function onPlaceInput(input) {
  clearTimeout(_placeTimer);
  const q = input.value.trim();
  hidePlaceSuggestions();
  state.lat = state.lon = state.tz = null; // invalidate until re-picked
  if (q.length < 2) return;
  _placeTimer = setTimeout(() => fetchPlaces(q), 360);
}

async function fetchPlaces(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=7&addressdetails=1&featuretype=settlement&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) return;
    const raw = await res.json();
    const kept = new Set();
    _placeSuggestions = raw.map(r => {
      const city    = r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || r.address?.county || r.name;
      const state_  = r.address?.state || r.address?.county || '';
      const country = r.address?.country || '';
      const key = `${city}|${country}`;
      if (!city || kept.has(key)) return null;
      kept.add(key);
      return { city, state: state_, country, lat: +r.lat, lon: +r.lon };
    }).filter(Boolean).slice(0, 5);
    showPlaceSuggestions();
  } catch {}
}

function showPlaceSuggestions() {
  const el = document.getElementById('placeSuggestions');
  if (!el) return;
  if (!_placeSuggestions.length) { hidePlaceSuggestions(); return; }
  el.innerHTML = _placeSuggestions.map((p, i) => `
    <div class="ps-item" onmousedown="selectPlace(${i})">
      <div class="ps-city">${esc(p.city)}</div>
      <div class="ps-region">${esc([p.state, p.country].filter(Boolean).join(', '))}</div>
    </div>`).join('');
  el.style.display = 'block';
}

function hidePlaceSuggestions() {
  const el = document.getElementById('placeSuggestions');
  if (el) el.style.display = 'none';
}

function selectPlace(i) {
  const p = _placeSuggestions[i];
  if (!p) return;
  const input = document.getElementById('fPlace');
  input.value = [p.city, p.country].filter(Boolean).join(', ');
  state.place = input.value;
  state.lat = p.lat;
  state.lon = p.lon;
  state.tz = null;
  hidePlaceSuggestions();
  schedulePreview();
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ─── TIMEZONE + UTC (ported from Chart Compass) ─────────────────────────────
async function fetchTimezone(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto`);
    if (!res.ok) return null;
    return (await res.json()).timezone || null;
  } catch { return null; }
}

function localToUTC(dateStr, timeStr, tz, lonFallback) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm]   = (timeStr || '12:00').split(':').map(Number);
  const base = Date.UTC(y, mo - 1, d, hh, mm);
  if (!tz) {
    const offMin = lonFallback != null ? Math.round(lonFallback / 15) * 60 : 0;
    return new Date(base - offMin * 60000);
  }
  let guess = base;
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  for (let i = 0; i < 3; i++) {
    const name = dtf.formatToParts(new Date(guess)).find(p => p.type === 'timeZoneName').value;
    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const offMin = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
    const next = base - offMin * 60000;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

// ─── PREVIEW ORCHESTRATION ──────────────────────────────────────────────────
let _previewTimer = null;
function schedulePreview() {
  updateSummary();
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(computeAndPreview, 300);
}

async function computeAndPreview() {
  const panel = document.getElementById('skyPreview');
  if (!state.birthDate) { setPreviewEmpty('Add a birth date to see the sky begin to appear.'); return; }
  if (typeof Astronomy === 'undefined') { setPreviewEmpty('The sky engine is still loading — one moment.'); return; }

  try {
    setPreviewLoading();
    if (state.lat != null && !state.tz) state.tz = await fetchTimezone(state.lat, state.lon);

    const hasTime = !!state.birthTime;
    const hasPlace = state.lat != null;
    const utc = localToUTC(state.birthDate, state.birthTime, state.tz, state.lon);
    const chart = computeChart(utc, state.lat, state.lon, hasTime && hasPlace);
    const sky = deriveSky(chart);

    // Human Design + Gene Keys (design sun ~88° of solar arc before birth)
    let hd = null, gk = null;
    try {
      const sunLon = chart.planets[0].lon;
      const design = Astronomy.SearchSunLongitude((sunLon - 88 + 360) % 360, new Date(utc.getTime() - 120 * 86400e3), 60);
      if (design) { hd = computeHD(utc, design.date); gk = computeGK(hd); }
    } catch {}

    const chinese = chineseSign(state.birthDate);
    const num = numerology(state.birthDate, state.fullName);
    const copy = previewCopy(state.name, sky, chinese, hd && hd.type);
    renderPreview(sky, copy, hasTime, hasPlace);

    // Retain a compact chart summary + the element (illustration accent).
    state.element = sky.sunElement || 'Water';
    state.chartText = buildChartSummary(chart, hd, gk, chinese, num, hasTime, hasPlace);
    state.hasTime = hasTime;
    state.hasPlace = hasPlace;
  } catch (e) {
    setPreviewEmpty('Could not read this sky — check the birth date and place.');
  }
}

function setPreviewEmpty(msg) {
  document.getElementById('skyPreview').innerHTML =
    `<div class="ss-preview-empty"><div class="ss-empty-orb"></div><p>${esc(msg)}</p></div>`;
}
function setPreviewLoading() {
  document.getElementById('skyPreview').innerHTML =
    `<div class="ss-preview-empty"><div class="ss-empty-orb is-spin"></div><p>Reading the sky…</p></div>`;
}

function renderPreview(sky, copy, hasTime, hasPlace) {
  const facts = copy.facts.map(f => `<span class="ss-fact">${esc(f)}</span>`).join('');
  const lines = copy.lines.map(l => `<p>${esc(l)}</p>`).join('');
  const noTime = hasTime && hasPlace ? '' :
    `<p class="ss-note">${hasPlace
        ? 'Add a birth time and the rising sign appears — the face they show the world.'
        : 'Add the birthplace (and a birth time) to unlock the rising sign.'}</p>`;
  document.getElementById('skyPreview').innerHTML = `
    ${skyVignette(sky)}
    <h3 class="ss-headline">${esc(copy.headline)}</h3>
    <div class="ss-facts">${facts}</div>
    <div class="ss-copy">${lines}${noTime}</div>
    <p class="ss-mirror">A story is a mirror, not a map of the future.</p>`;
}

// ─── ORDER SUMMARY + CTA ─────────────────────────────────────────────────────
function updateSummary() {
  const el = document.getElementById('ssSummary');
  if (!el) return;
  const band = currentBand();
  const langs = state.bookLangs.length ? state.bookLangs.join(' · ') : '—';
  el.innerHTML = `
    <div><span>Edition</span><strong>${band.label} · ${esc(band.reader)}</strong></div>
    <div><span>Book languages</span><strong>${esc(langs)}</strong></div>
    <div><span>Parents’ page</span><strong>${esc(state.parentsLang)}</strong></div>`;
}

// ─── ART STYLE (house-style vector, or rendered/painted opt-in) ──────────────
const ART_STYLES = [
  { id: 'vector',  label: 'House style', hint: 'gold & ink vector scenes' },
  { id: 'painted', label: 'Painted',     hint: 'rendered art · beta' },
];
function renderArtStyle() {
  const wrap = document.getElementById('artStyle');
  if (!wrap) return;
  wrap.innerHTML = ART_STYLES.map(a => `
    <button type="button" class="ss-chip${a.id === state.artStyle ? ' is-on' : ''}" data-art="${a.id}">
      <span class="ss-chip-t">${a.label}</span>
      <span class="ss-chip-s">${a.hint}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-art]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.artStyle = btn.dataset.art;
      wrap.querySelectorAll('.ss-chip').forEach(c => c.classList.toggle('is-on', c.dataset.art === state.artStyle));
      const note = document.getElementById('artNote');
      if (note) note.textContent = state.artStyle === 'painted'
        ? 'Painted mode calls an image model per scene — needs an image API key on the server; falls back to the house style if unavailable.'
        : 'Vector scenes, tinted to the child’s element — sharp at any print size, included.';
    }));
}

// Compact, human-readable chart the generator prompt reads.
function buildChartSummary(chart, hd, gk, chinese, num, hasTime, hasPlace) {
  const EL = ['Fire', 'Earth', 'Air', 'Water'];
  const tally = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  const L = [];
  chart.planets.forEach(p => {
    if (p.name !== 'N.Node') tally[EL[signOf(p.lon) % 4]]++;
    L.push(`${p.name.padEnd(8)} ${fmtLon(p.lon)}${p.house ? '  H' + p.house : ''}`);
  });
  if (chart.angles) { L.push(`ASC      ${fmtLon(chart.angles.asc)}`); L.push(`MC       ${fmtLon(chart.angles.mc)}`); }
  L.push(`Elements: ${EL.map(e => `${e} ${tally[e]}`).join(' · ')}`);
  if (hd) L.push(`Human Design: ${hd.type} · ${hd.authority} · ${hd.profile}`);
  if (gk) L.push(`Gene Keys: LW ${gk.lifesWork} · Ev ${gk.evolution} · Ra ${gk.radiance} · Pu ${gk.purpose}`);
  L.push(`Chinese: ${chinese.element} ${chinese.animal} (${chinese.year})  ← recurring companion/talisman`);
  if (num && num.lifePath != null) {
    const extra = num.expression != null ? ` · Expression ${num.expression} · Soul ${num.soul}` : ' (Life Path from birth date only — add a full name for Expression/Soul)';
    L.push(`Numerology: Life Path ${num.lifePath}${extra}`);
  }
  if (!hasTime) L.push('(no birth time — ASC/houses omitted, Moon approximate)');
  else if (!hasPlace) L.push('(no birthplace — houses omitted)');
  return L.join('\n');
}

async function onCreate() {
  const problems = [];
  if (!state.name.trim()) problems.push('the child’s name');
  if (!state.birthDate) problems.push('a birth date');
  if (!state.bookLangs.length) problems.push('at least one book language');
  const note = document.getElementById('ssCreateNote');
  if (problems.length) {
    note.className = 'ss-create-note is-warn';
    note.textContent = `Almost — add ${problems.join(', ')} first.`;
    return;
  }
  // Make sure a chart summary exists (compute may still be debounced).
  if (!state.chartText) { note.className = 'ss-create-note'; note.textContent = 'Reading the sky…'; await computeAndPreview(); }
  if (!state.chartText) {
    note.className = 'ss-create-note is-warn';
    note.textContent = 'Could not read the sky — check the birth date and place.';
    return;
  }
  note.className = 'ss-create-note';
  note.textContent = '';

  const band = currentBand();
  const payload = {
    birth: { name: state.name.trim(), date: state.birthDate, time: state.birthTime, place: state.place },
    chart: state.chartText,
    edition: state.age,
    languages: state.bookLangs,
    form: band.forms ? state.form : 'story',
    inputMode: state.inputMode,
    parentsLang: state.parentsLang,
    details: state.inputMode === 'details' ? state.details : null,
    theme: state.inputMode === 'theme' ? state.theme : null,
    accessCode: state.accessCode || undefined,
  };
  openReader(payload, `${state.name.trim()} · ${band.label}`);
}
