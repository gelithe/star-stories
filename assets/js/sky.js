// Star Stories — the "his sky" layer.
// Product config (age registers + language mixing shapes, from README.md /
// LANGUAGES.md) and the poetic preview: turns a computed chart into gentle,
// mirror-not-destiny copy and a house-style SVG vignette. Kept deliberately
// evocative and never predictive (the ethical line is non-negotiable).

// ─── PRODUCT: age editions (README.md) ───────────────────────────────────────
const AGE_BANDS = [
  { id: '0-2',  label: '0–2',        reader: 'read to the baby',      register: 'Lullaby cadence — few words, the pictures carry it.',            shape: 'echo' },
  { id: '2-5',  label: '2–5',        reader: 'bedtime story',         register: 'An animal fable — rhythm, repetition, a little creature who feels everything.', shape: 'rotating-lead' },
  { id: '6-8',  label: '6–8',        reader: 'early self-reading',    register: 'A quest with short chapters — the child as the hero.',           shape: 'rotating-chapters' },
  { id: '9-12', label: '9–12',       reader: 'private reading',       register: 'Adventure and first interiority — "your secret compass".',       shape: 'single-lead' },
  { id: 'teen', label: 'Teenager',   reader: 'skeptical reading',     register: 'Honest and unpatronising — identity and intensity.',            shape: 'single-lead' },
  { id: 'ya',   label: 'Young adult',reader: 'leaving home',          register: 'A letter to carry — the parents’ book, re-addressed to them.', shape: 'single-lead', forms: true },
  { id: 'adult',label: 'Adult',      reader: 'for the grown reader',  register: 'A reflective portrait — the sky read back to the person themselves.', shape: 'single-lead', forms: true },
];

// Form of the writing (adult editions choose; children's editions are always a story).
const FORMS = [
  { id: 'prose',  label: 'Prose',  hint: 'a literary portrait' },
  { id: 'poem',   label: 'Poem',   hint: 'a lyric, image-led piece' },
  { id: 'letter', label: 'Letter', hint: 'addressed to them directly' },
];

// ─── PRODUCT: language mixing shapes (LANGUAGES.md) ──────────────────────────
const MIXING_SHAPES = {
  'echo':              'Echo — every spread says one thing, once per language (lullaby repetition).',
  'rotating-lead':     'Rotating lead — each scene led by one language, closed by a one-line echo in another; a chant recurs in all.',
  'rotating-chapters': 'Rotating chapters — each chapter led by one language with bridge echoes; the refrain always in every language.',
  'single-lead':       'Single lead — one language leads, with meaningful phrases from the others (family words stay family words).',
};

const BOOK_LANGUAGES = [
  { code: 'LT', name: 'Lithuanian' },
  { code: 'IT', name: 'Italian' },
  { code: 'DE', name: 'German' },
  { code: 'EN', name: 'English' },
];
const PARENTS_LANGUAGES = [
  { code: 'IT', name: 'Italiano' },
  { code: 'EN', name: 'English' },
  { code: 'LT', name: 'Lietuvių' },
  { code: 'DE', name: 'Deutsch' },
];

// ─── SIGN POETRY (mirror, not prophecy) ──────────────────────────────────────
// element by sign index; a gentle word for a Sun placement and a Moon placement.
const ELEMENTS = ['Fire','Earth','Air','Water']; // Aries=Fire, Taurus=Earth, …
const SIGN_POETRY = {
  Aries:       { sun: 'a small brave fire',            moon: 'feelings that arrive first and fast' },
  Taurus:      { sun: 'steady, rooted warmth',         moon: 'a heart that settles into what it loves' },
  Gemini:      { sun: 'quick, curious light',          moon: 'a mind that feels in questions' },
  Cancer:      { sun: 'a tender, sheltering glow',     moon: 'feelings as deep and tidal as the sea' },
  Leo:         { sun: 'a generous, sunlit heart',      moon: 'a heart that shines when it is seen' },
  Virgo:       { sun: 'a careful, noticing light',     moon: 'feelings that want to help and to tend' },
  Libra:       { sun: 'a fair and gentle warmth',      moon: 'a heart that reaches for another' },
  Scorpio:     { sun: 'a deep, private fire',          moon: 'feelings deeper than anyone knows' },
  Sagittarius: { sun: 'a far-seeing, roaming light',   moon: 'a heart that feels most free outdoors' },
  Capricorn:   { sun: 'a serious, mountain-steady sun', moon: 'feelings kept safe behind a quiet face' },
  Aquarius:    { sun: 'a bright, unusual light',        moon: 'a heart that feels for everyone at once' },
  Pisces:      { sun: 'a dreaming, watery glow',        moon: 'feelings as wide as an inner ocean' },
};

// Turn a computed chart into the preview model.
function deriveSky(chart) {
  const sun  = chart.planets.find(p => p.name === 'Sun');
  const moon = chart.planets.find(p => p.name === 'Moon');
  const sunIdx  = signOf(sun.lon);
  const moonIdx = signOf(moon.lon);
  const sky = {
    sunSign:  SIGNS[sunIdx],
    moonSign: SIGNS[moonIdx],
    sunElement:  ELEMENTS[sunIdx % 4],
    moonElement: ELEMENTS[moonIdx % 4],
    rising: null,
  };
  if (chart.angles) sky.rising = SIGNS[signOf(chart.angles.asc)];
  return sky;
}

// Headline + supporting lines. `name` is the child's name (never translated).
function previewCopy(name, sky, chinese, hdType) {
  const who = name && name.trim() ? name.trim() : 'This child';
  const headline = `${who} was born under ${article(sky.sunSign)} ${sky.sunSign} sun and a ${sky.moonSign} moon.`;
  const lines = [
    `Their sun is ${SIGN_POETRY[sky.sunSign].sun}.`,
    `Their moon carries ${SIGN_POETRY[sky.moonSign].moon}.`,
  ];
  if (sky.rising) lines.push(`They meet the world with ${sky.rising} rising — the face they show first.`);
  const facts = [];
  facts.push(`${sky.sunSign} sun`);
  facts.push(`${sky.moonSign} moon`);
  if (sky.rising) facts.push(`${sky.rising} rising`);
  if (hdType) facts.push(`${hdType} (Human Design)`);
  if (chinese) facts.push(`${chinese.element} ${chinese.animal}`);
  return { headline, lines, facts };
}

function article(sign) { return 'AEIOU'.includes(sign[0]) ? 'an' : 'a'; }

// ─── HOUSE-STYLE SVG VIGNETTE ────────────────────────────────────────────────
// Gold sun, silver-gold moon, a scatter of stars, on a warm night wash. The
// accent tints by the sun's element so every child's sky feels a little theirs.
const ELEMENT_ACCENT = { Fire: '#c9772b', Earth: '#7a8c4a', Air: '#6f9bb5', Water: '#1a9eae' };

function skyVignette(sky) {
  const accent = ELEMENT_ACCENT[sky.sunElement] || '#1a9eae';
  const stars = [
    [40,38,1.4],[86,26,1.0],[132,52,1.6],[196,34,1.2],[232,66,1.0],
    [64,74,1.0],[168,80,1.3],[210,104,1.1],[36,110,1.2],[110,120,1.0],
    [150,30,0.9],[250,42,1.0],[22,64,0.9],[264,96,1.2],[96,96,0.9],
  ].map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="ss-star"/>`).join('');
  // little constellation lines linking a few stars
  const lines = `<path class="ss-constln" d="M40 38 L86 26 L132 52 L110 120"/>`;
  return `
  <svg viewBox="0 0 288 180" class="ss-vignette" role="img"
       aria-label="${sky.sunSign} sun and ${sky.moonSign} moon">
    <defs>
      <radialGradient id="ssNight" cx="50%" cy="42%" r="72%">
        <stop offset="0%"  stop-color="#20202e"/>
        <stop offset="100%" stop-color="#0e0e18"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="288" height="180" rx="10" fill="url(#ssNight)"/>
    ${lines}
    ${stars}
    <!-- moon, crescent -->
    <g transform="translate(60 116)">
      <circle r="17" fill="#e9e4d4"/>
      <circle r="17" cx="8" cy="-3" fill="#0e0e18"/>
    </g>
    <!-- sun, gold rays tinted by element -->
    <g transform="translate(214 118)">
      <g stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.85">
        ${sunRays()}
      </g>
      <circle r="16" fill="#c9a227"/>
      <circle r="16" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.6"/>
    </g>
  </svg>`;
}

function sunRays() {
  let out = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x1 = Math.cos(a) * 21, y1 = Math.sin(a) * 21;
    const x2 = Math.cos(a) * 27, y2 = Math.sin(a) * 27;
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return out;
}
