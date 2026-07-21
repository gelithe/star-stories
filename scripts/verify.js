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

// Lars: 2019-04-03 04:16 Europe/Berlin (UTC+2 in April) = 02:16 UTC. Frankfurt.
const r = ctx.__test(Date.UTC(2019,3,3,2,16), 50.1109, 8.6821, true, '2019-04-03', 'Lars');
const expect = {
  sun: "Aries 13°02'", moon: "Pisces 17°35'", asc: "Capricorn 24°08'",
  hd: 'Generator · Sacral · 4/6', chinese: 'Earth Pig (2019)'
};
let ok = true;
for (const k of Object.keys(expect)) {
  const pass = r[k] === expect[k];
  ok = ok && pass;
  console.log(`${pass ? '✓' : '✗'} ${k}: ${r[k]}${pass ? '' : `  (expected ${expect[k]})`}`);
}
console.log('headline:', r.headline);
console.log('facts:', r.facts.join(', '));
console.log(ok ? '\nALL CHECKS PASSED' : '\nCHECKS FAILED');
process.exit(ok ? 0 : 1);
