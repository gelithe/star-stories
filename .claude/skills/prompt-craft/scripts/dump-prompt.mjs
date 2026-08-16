#!/usr/bin/env node
// Print the exact brief the writer receives — no API call, no credits spent.
//
// The brief is ASSEMBLED per band and form, so reading generate.js does not
// tell you what the model actually sees. Read this output instead.
//
//   node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --band ya
//   node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --band 6-8 --langs LT,IT,DE
//   node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --all        (sizes only)
//   node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --band ya --grep wave
//
// --grep is the leak check: when a letter borrows a word, look for that word
// in the brief before writing a rule about it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = name => args.includes('--' + name);

const REPO = path.resolve(new URL('../../../..', import.meta.url).pathname);
const SRC = path.join(REPO, 'functions/api/generate.js');

// generate.js is a Cloudflare Function, not a library. Copy it with the
// internals exported so the builders can be called directly.
async function loadGenerator() {
  const src = fs.readFileSync(SRC, 'utf8')
    + '\nexport { buildSystemPrompt, buildUserPrompt, normalizeSpec, modelForSpec };\n';
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sspc-')), 'generate.mjs');
  fs.writeFileSync(tmp, src);
  return import(tmp);
}

// A stand-in chart. Real placements are not needed to inspect a brief — but
// keep every system present (astrology, HD, Gene Keys, Chinese, numerology) so
// the blocks that depend on them all render.
const SAMPLE_CHART = `Sun      20°14' Gemini   H12
Moon      3°51' Scorpio  H4
Mercury   6°33' Gemini   H12
Venus    28°47' Cancer   H1
Mars     19°22' Libra    H4
ASC      26°02' Cancer
Elements: Fire 1 · Earth 2 · Air 4 · Water 3
Human Design: Projector · Emotional · 6/2
Gene Keys: LW 25 · Ev 46 · Ra 12 · Pu 22
  Gifts (printable): Acceptance · Delight · Discrimination · Graciousness
  Shadows (NEVER print): Constriction · Seriousness · Vanity · Dishonour
Chinese: Water Dog (1982)
Numerology: Life Path 9`;

const BANDS = ['0-2', '3-5', '6-8', '9-12', 'teen', 'ya'];

function specFor(m, band, form, langs) {
  return m.normalizeSpec({
    edition: band, form, languages: langs, parentsLang: langs[0], inputMode: 'surprise',
    birth: { name: 'Ramunė', date: '1982-06-11', time: '04:20', place: 'Kaunas, Lithuania' },
    chart: SAMPLE_CHART,
  });
}

const m = await loadGenerator();
const langs = arg('langs', 'LT,IT,DE').split(',').map(s => s.trim()).filter(Boolean);
const form = arg('form', 'letter');

if (has('all')) {
  console.log('band   chars  model');
  for (const band of BANDS) {
    const s = specFor(m, band, form, langs);
    const sys = m.buildSystemPrompt(s);
    console.log(band.padEnd(6), String(sys.length).padStart(5), ' ', m.modelForSpec(s, {}));
  }
  console.log('\nSize is a signal, not a target — but a brief that only grows is getting worse.');
  process.exit(0);
}

const band = arg('band', 'ya');
if (!BANDS.includes(band)) {
  console.error(`Unknown band "${band}". One of: ${BANDS.join(', ')}`);
  process.exit(1);
}

const spec = specFor(m, band, form, langs);
const system = m.buildSystemPrompt(spec);
const user = m.buildUserPrompt(spec);

const needle = arg('grep', null);
if (needle) {
  const re = new RegExp(needle, 'gi');
  const hits = [...(system + '\n' + user).split('\n').entries()]
    .filter(([, line]) => re.test(line) && (re.lastIndex = 0) === 0);
  console.log(`"${needle}" in the ${band} brief: ${hits.length} line(s)\n`);
  for (const [i, line] of hits) console.log(`  ${String(i + 1).padStart(3)}  ${line.trim()}`);
  if (!hits.length) console.log('  (not in the brief — this one is coming from the chart text or the model itself)');
  process.exit(0);
}

console.log(`# ${band} · ${spec.form} · ${langs.join(',')} · ${m.modelForSpec(spec, {})}`);
console.log(`# system ${system.length} chars · user ${user.length} chars`);
console.log(`\n${'='.repeat(78)}\nSYSTEM\n${'='.repeat(78)}\n\n${system}`);
console.log(`\n${'='.repeat(78)}\nUSER\n${'='.repeat(78)}\n\n${user}`);
console.log(`\n${'='.repeat(78)}\nNothing else is sent. No examples, no memory of any previous book or letter.`);
