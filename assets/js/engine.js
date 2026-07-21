// Star Stories — astro engine (browser build)
// Ported verbatim from gelithe/docs/star-stories/engine/chart.js, adapted to run
// as a classic <script> using the global `Astronomy` (astronomy-engine, loaded
// from CDN before this file). Computes: natal chart, Human Design, Gene Keys,
// Chinese zodiac. Validated against AstroSeek. Do not diverge from the canonical
// engine without re-validating.

// ─── ASTRO ENGINE (uses astronomy-engine global `Astronomy`) ──────────────────
const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const D2R = Math.PI/180, R2D = 180/Math.PI;

function fmtLon(l) {
  l = ((l % 360) + 360) % 360;
  const s = Math.floor(l / 30), d = l % 30;
  return `${SIGNS[s]} ${String(Math.floor(d)).padStart(2,'0')}°${String(Math.floor((d%1)*60)).padStart(2,'0')}'`;
}

// Sign index (0=Aries … 11=Pisces) for an ecliptic longitude.
function signOf(l) {
  l = ((l % 360) + 360) % 360;
  return Math.floor(l / 30);
}

function meanNode(dateUTC) {
  const jd = dateUTC.getTime()/86400000 + 2440587.5;
  const T = (jd - 2451545.0)/36525.0;
  let o = 125.0445479 - 1934.1362891*T + 0.0020754*T*T + T*T*T/467441;
  return ((o % 360) + 360) % 360;
}

function eclLon(body, date) {
  return Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true)).elon;
}

function obliquity(dateUTC) {
  const jd = dateUTC.getTime()/86400000 + 2440587.5;
  const T = (jd - 2451545.0)/36525.0;
  return 23.4392911 - 0.0130042*T;
}

function anglesAndCusps(dateUTC, lat, lon) {
  const eps = obliquity(dateUTC);
  const ramc = ((Astronomy.SiderealTime(dateUTC)*15 + lon) % 360 + 360) % 360;
  const mc  = (Math.atan2(Math.sin(ramc*D2R), Math.cos(ramc*D2R)*Math.cos(eps*D2R))*R2D + 360) % 360;
  const asc = (Math.atan2(Math.cos(ramc*D2R),
               -(Math.sin(ramc*D2R)*Math.cos(eps*D2R) + Math.tan(lat*D2R)*Math.sin(eps*D2R)))*R2D + 360) % 360;

  function placidus(offset, frac) {
    let alpha = (ramc + offset) % 360, lam = 0;
    for (let i = 0; i < 30; i++) {
      lam = (Math.atan2(Math.sin(alpha*D2R), Math.cos(alpha*D2R)*Math.cos(eps*D2R))*R2D + 360) % 360;
      const delta = Math.asin(Math.sin(eps*D2R)*Math.sin(lam*D2R));
      const x = Math.max(-1, Math.min(1, Math.tan(lat*D2R)*Math.tan(delta)));
      alpha = (ramc + offset + frac*(Math.asin(x)*R2D)) % 360;
    }
    return lam;
  }

  const c11 = placidus(30, 1/3), c12 = placidus(60, 2/3);
  const c2 = placidus(120, 2/3), c3 = placidus(150, 1/3);
  const cusps = [asc, c2, c3, (mc+180)%360, (c11+180)%360, (c12+180)%360,
                 (asc+180)%360, (c2+180)%360, (c3+180)%360, mc, c11, c12];
  return { asc, mc, cusps, polar: Math.abs(lat) > 66 };
}

function houseOf(lon, cusps) {
  for (let h = 0; h < 12; h++) {
    const a = cusps[h], b = cusps[(h+1)%12];
    const span = ((b - a) + 360) % 360, off = ((lon - a) + 360) % 360;
    if (off < span) return h + 1;
  }
  return 1;
}

const PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

function computeChart(dateUTC, lat, lon, hasTime) {
  const planets = PLANETS.map(p => ({ name: p, lon: eclLon(p, dateUTC) }));
  planets.push({ name: 'N.Node', lon: meanNode(dateUTC) });
  let angles = null;
  if (hasTime && lat != null) {
    angles = anglesAndCusps(dateUTC, lat, lon);
    planets.forEach(p => p.house = houseOf(p.lon, angles.cusps));
  }
  return { planets, angles };
}

// ─── HUMAN DESIGN / GENE KEYS ────────────────────────────────────────────────
const GATE_WHEEL = [41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60];

function gateLine(lon) {
  const off = ((lon - 302) % 360 + 360) % 360;
  const idx = Math.floor(off / 5.625);
  const line = Math.floor((off % 5.625) / 0.9375) + 1;
  return { gate: GATE_WHEEL[idx], line };
}

const HD_CHANNELS = [[1,8],[2,14],[3,60],[4,63],[5,15],[6,59],[7,31],[9,52],[10,20],[10,34],[10,57],[11,56],[12,22],[13,33],[16,48],[17,62],[18,58],[19,49],[20,34],[20,57],[21,45],[23,43],[24,61],[25,51],[26,44],[27,50],[28,38],[29,46],[30,41],[32,54],[34,57],[35,36],[37,40],[39,55],[42,53],[47,64]];

const HD_CENTERS = {
  Head:   [64,61,63],
  Ajna:   [47,24,4,17,43,11],
  Throat: [62,23,56,35,12,45,33,8,31,20,16],
  G:      [1,13,25,46,2,15,10,7],
  Heart:  [26,51,21,40],
  Sacral: [34,5,14,29,59,9,3,42,27],
  Spleen: [48,57,44,50,32,28,18],
  SolarPlexus: [36,22,37,6,49,55,30],
  Root:   [58,38,54,53,60,52,19,39,41]
};
const MOTORS = ['Sacral','SolarPlexus','Heart','Root'];

function centerOfGate(g) {
  for (const [c, gates] of Object.entries(HD_CENTERS)) if (gates.includes(g)) return c;
  return null;
}

function computeHD(birthUTC, designUTC) {
  function activations(date) {
    const sun = eclLon('Sun', date);
    const list = [
      { body: 'Sun', lon: sun }, { body: 'Earth', lon: (sun+180)%360 },
      { body: 'Moon', lon: eclLon('Moon', date) },
      { body: 'N.Node', lon: meanNode(date) }, { body: 'S.Node', lon: (meanNode(date)+180)%360 },
    ];
    for (const p of ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'])
      list.push({ body: p, lon: eclLon(p, date) });
    list.forEach(a => Object.assign(a, gateLine(a.lon)));
    return list;
  }
  const pers = activations(birthUTC), des = activations(designUTC);
  const gates = new Set([...pers, ...des].map(a => a.gate));

  const channels = HD_CHANNELS.filter(([a,b]) => gates.has(a) && gates.has(b));
  const defined = new Set();
  const edges = [];
  channels.forEach(([a,b]) => {
    const ca = centerOfGate(a), cb = centerOfGate(b);
    defined.add(ca); defined.add(cb);
    edges.push([ca, cb]);
  });

  // motor→throat connectivity through defined centers
  function connected(from, to) {
    const seen = new Set([from]); const q = [from];
    while (q.length) {
      const c = q.shift();
      if (c === to) return true;
      edges.forEach(([a,b]) => {
        if (a === c && !seen.has(b)) { seen.add(b); q.push(b); }
        if (b === c && !seen.has(a)) { seen.add(a); q.push(a); }
      });
    }
    return false;
  }
  const motorToThroat = MOTORS.some(m => defined.has(m) && connected(m, 'Throat'));

  let type;
  if (!defined.size) type = 'Reflector';
  else if (defined.has('Sacral')) type = motorToThroat ? 'Manifesting Generator' : 'Generator';
  else if (motorToThroat) type = 'Manifestor';
  else type = 'Projector';

  let authority;
  if (type === 'Reflector') authority = 'Lunar (wait a moon cycle)';
  else if (defined.has('SolarPlexus')) authority = 'Emotional';
  else if (defined.has('Sacral')) authority = 'Sacral';
  else if (defined.has('Spleen')) authority = 'Splenic';
  else if (defined.has('Heart')) authority = 'Ego';
  else if (defined.has('G')) authority = 'Self-Projected';
  else authority = 'Mental / Environmental';

  const profile = `${pers[0].line}/${des[0].line}`;
  return { type, authority, profile, defined: [...defined], channels, pers, des };
}

function computeGK(hd) {
  const pSun = hd.pers.find(a => a.body==='Sun'), pEarth = hd.pers.find(a => a.body==='Earth');
  const dSun = hd.des.find(a => a.body==='Sun'),  dEarth = hd.des.find(a => a.body==='Earth');
  return {
    lifesWork: `${pSun.gate}.${pSun.line}`, evolution: `${pEarth.gate}.${pEarth.line}`,
    radiance: `${dSun.gate}.${dSun.line}`,  purpose: `${dEarth.gate}.${dEarth.line}`
  };
}

// ─── CHINESE ZODIAC ─────────────────────────────────────────────────────────
// Year animal + element, with Chinese New Year boundary handling (dates table
// 1984–2050; birthdays before CNY belong to the previous year's sign).
const CNY = {1984:'02-02',1985:'02-20',1986:'02-09',1987:'01-29',1988:'02-17',1989:'02-06',1990:'01-27',1991:'02-15',1992:'02-04',1993:'01-23',1994:'02-10',1995:'01-31',1996:'02-19',1997:'02-07',1998:'01-28',1999:'02-16',2000:'02-05',2001:'01-24',2002:'02-12',2003:'02-01',2004:'01-22',2005:'02-09',2006:'01-29',2007:'02-18',2008:'02-07',2009:'01-26',2010:'02-14',2011:'02-03',2012:'01-23',2013:'02-10',2014:'01-31',2015:'02-19',2016:'02-08',2017:'01-28',2018:'02-16',2019:'02-05',2020:'01-25',2021:'02-12',2022:'02-01',2023:'01-22',2024:'02-10',2025:'01-29',2026:'02-17',2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-03',2031:'01-23',2032:'02-11',2033:'01-31',2034:'02-19',2035:'02-08',2036:'01-28',2037:'02-15',2038:'02-04',2039:'01-24',2040:'02-12',2041:'02-01',2042:'01-22',2043:'02-10',2044:'01-30',2045:'02-17',2046:'02-06',2047:'01-26',2048:'02-14',2049:'02-02',2050:'01-23'};
const CN_ANIMALS  = ['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig'];
const CN_ELEMENTS = ['Wood','Fire','Earth','Metal','Water'];

function chineseSign(dateStr) { // 'YYYY-MM-DD' (local birth date)
  let [y, m, d] = dateStr.split('-').map(Number);
  const cny = CNY[y];
  if (cny) {
    const [cm, cd] = cny.split('-').map(Number);
    if (m < cm || (m === cm && d < cd)) y -= 1;
  } else if (m === 1 || (m === 2 && d < 5)) {
    y -= 1; // approximate boundary outside the table
  }
  return { animal: CN_ANIMALS[(y - 4) % 12], element: CN_ELEMENTS[Math.floor(((y - 4) % 10) / 2)], year: y };
}
