// Validate the browser engine (assets/js/engine.js) + sky layer
// (assets/js/sky.js) in Node by loading them into a shared scope with the
// Astronomy global, then reproducing Lars' known chart from the book's
// parents' page.
//
// Usage (astronomy-engine must be installed):
//   npm install astronomy-engine@2
//   NODE_PATH=./node_modules node scripts/verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.Astronomy = require('astronomy-engine');
const root = path.join(__dirname, '..', 'assets', 'js');
const engineSrc = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
const skySrc = fs.readFileSync(path.join(root, 'sky.js'), 'utf8');

// Run both in one shared context (mimics classic <script> global sharing).
const ctx = { Astronomy: global.Astronomy, Math, Object, console, Intl, Date, Set, Map };
vm.createContext(ctx);
vm.runInContext(engineSrc + '\n' + skySrc, ctx);
vm.runInContext(`
  globalThis.__test = function(dateUTCms, lat, lon, hasTime, dateStr, name){
    const utc = new Date(dateUTCms);
    const chart = computeChart(utc, lat, lon, hasTime);
    const sun = chart.planets.find(p=>p.name==='Sun');
    let hd=null;
    const design = Astronomy.SearchSunLongitude((sun.lon-88+360)%360, new Date(utc.getTime()-120*86400e3), 60);
    if(design) hd = computeHD(utc, design.date);
    const sky = deriveSky(chart);
    const chinese = chineseSign(dateStr);
    const copy = previewCopy(name, sky, chinese, hd && hd.type);
    return {
      sun: fmtLon(sun.lon), moon: fmtLon(chart.planets.find(p=>p.name==='Moon').lon),
      asc: chart.angles ? fmtLon(chart.angles.asc) : null,
      hd: hd && (hd.type+' · '+hd.authority+' · '+hd.profile),
      chinese: chinese.element+' '+chinese.animal+' ('+chinese.year+')',
      headline: copy.headline, facts: copy.facts
    };
  };
`, ctx);

// The three published books, all born in Frankfurt am Main. Each expectation is
// taken from that book's printed parents' page — so this asserts the engine
// still reproduces the charts the handcrafted originals were written from.
// See reference-books/ for the books themselves.
const FRANKFURT = [50.1109, 8.6821];
const CASES = [
  { name: 'Lars', utc: Date.UTC(2019, 3, 3, 2, 16), date: '2019-04-03',   // 04:16 CEST
    expect: { sun: "Aries 13°02'", moon: "Pisces 17°35'", asc: "Capricorn 24°08'",
              hd: 'Generator · Sacral · 4/6', chinese: 'Earth Pig (2019)' } },
  { name: 'Nova', utc: Date.UTC(2024, 6, 16, 21, 4), date: '2024-07-16',  // 23:04 CEST
    expect: { sun: "Cancer 24°48'", moon: "Scorpio 27°42'", asc: "Pisces 07°37'",
              chinese: 'Wood Dragon (2024)' } },
  { name: 'Luis', utc: Date.UTC(2021, 3, 17, 17, 47), date: '2021-04-17', // 19:47 CEST
    expect: { sun: "Aries 27°55'", moon: "Gemini 29°11'", asc: "Libra 22°33'",
              chinese: 'Metal Ox (2021)' } },
];

let ok = true;
for (const c of CASES) {
  const r = ctx.__test(c.utc, FRANKFURT[0], FRANKFURT[1], true, c.date, c.name);
  console.log(`\n${c.name} — ${c.date}`);
  for (const k of Object.keys(c.expect)) {
    const pass = r[k] === c.expect[k];
    ok = ok && pass;
    console.log(`  ${pass ? '✓' : '✗'} ${k}: ${r[k]}${pass ? '' : `  (expected ${c.expect[k]})`}`);
  }
  console.log(`  headline: ${r.headline}`);
}
console.log(ok ? '\nALL CHECKS PASSED' : '\nCHECKS FAILED');
process.exit(ok ? 0 : 1);
