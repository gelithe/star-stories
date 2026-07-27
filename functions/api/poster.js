// ─── Star Stories · /api/poster ──────────────────────────────────────────────
// The "little compass" add-on: a small, printable poster of life-rules drawn
// from a child's REAL birth chart (or a family's charts together). Same ethic as
// the books — a story is a MIRROR, never a map of the future — distilled into a
// handful of gentle truths a child can keep on the wall.
//
// Unlike /api/generate (which streams HTML), this returns a compact JSON object
// the frontend lays out into the printable poster; the poster is short, so a
// single non-streamed response is simplest.
//
// Environment variables (Cloudflare Pages → Settings → Environment variables):
//   ANTHROPIC_API_KEY  required.
//   ACCESS_CODES       optional — same gate as /api/generate.
//   POSTER_MODEL       optional — model id (default claude-opus-5).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const codes = env => (env.ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
const LANG_NAMES = { LT: 'Lithuanian', IT: 'Italian', DE: 'German', EN: 'English' };

// The recurring cast, by Chinese animal (mirror of companions.json). Returned so
// the poster can show the child's companion beside their rules.
const COMPANIONS = {
  Rat: 'Pip', Ox: 'Bo', Tiger: 'Zuri', Rabbit: 'Mella', Dragon: 'Vael', Snake: 'Sema',
  Horse: 'Rio', Goat: 'Fenn', Monkey: 'Ollo', Rooster: 'Kesh', Dog: 'Baru', Pig: 'Pim',
};
const ANIMALS = Object.keys(COMPANIONS);
function companionFrom(chartText) {
  const m = new RegExp(`Chinese:\\s+(\\w+)\\s+(${ANIMALS.join('|')})`).exec(chartText || '');
  if (!m) return null;
  return { element: m[1], animal: m[2], name: COMPANIONS[m[2]] };
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const allowed = codes(env);
  if (allowed.length && !allowed.includes(String(body.accessCode || '').trim())) {
    return json({ error: 'Invalid or missing access code.' }, 401);
  }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: 'Server is missing ANTHROPIC_API_KEY.' }, 500);

  // people[]: one = a personal compass; two or more = a family compass.
  let people = Array.isArray(body.people) ? body.people : null;
  if (!people && body.chart) {
    people = [{ name: (body.birth && body.birth.name) || 'the child', chart: String(body.chart) }];
  }
  people = (people || [])
    .filter(p => p && p.chart)
    .slice(0, 6)
    .map(p => ({ name: String(p.name || 'the child').slice(0, 60), chart: String(p.chart).slice(0, 4000) }));
  if (!people.length) return json({ error: 'Missing chart data.' }, 400);

  const family = people.length > 1;
  const langs = (Array.isArray(body.languages) && body.languages.length ? body.languages : ['EN'])
    .filter(c => LANG_NAMES[c]);
  const lead = LANG_NAMES[langs[0]] || 'English';
  const others = langs.slice(1).map(c => LANG_NAMES[c]);
  const count = family ? Math.min(8, Math.max(6, people.length + 3)) : 6;

  const system = buildPosterPrompt({ family, people, lead, others, count });
  const user = buildPosterUser({ family, people, place: body.birth && body.birth.place, date: body.birth && body.birth.date });

  const payload = {
    model: env.POSTER_MODEL || DEFAULT_MODEL,
    max_tokens: 1600,
    system,
    messages: [{ role: 'user', content: user }],
    thinking: { type: 'disabled' },
  };

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) {
    const e = await upstream.json().catch(() => ({}));
    return json({ error: e?.error?.message || `Anthropic HTTP ${upstream.status}` }, upstream.status || 502);
  }
  const data = await upstream.json().catch(() => ({}));
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = extractJSON(text);
  if (!parsed || !Array.isArray(parsed.rules) || !parsed.rules.length) {
    return json({ error: 'The compass came back empty — please try again.' }, 502);
  }

  // Attach the (first person's) companion so the poster can show it.
  const comp = companionFrom(people[0].chart);
  return json({
    title: String(parsed.title || (family ? 'Our Little Compass' : `${people[0].name}’s Little Compass`)).slice(0, 120),
    subtitle: String(parsed.subtitle || '').slice(0, 200),
    kicker: String(parsed.kicker || '').slice(0, 120),
    rules: parsed.rules.slice(0, count).map(r => ({
      text: String(r.text || r.rule || '').slice(0, 240),
      source: String(r.source || r.for || '').slice(0, 80),
    })).filter(r => r.text),
    mirror: String(parsed.mirror || 'A story is a mirror — not a map of the future.').slice(0, 160),
    companion: comp,
    family,
  });
}

function buildPosterPrompt({ family, lead, others, count }) {
  const o = [];
  o.push(`You are the author of "Star Stories". You turn a child's REAL birth chart (natal astrology + Human Design + Gene Keys + Chinese zodiac + numerology) into a small printable poster called a "little compass" — a handful of gentle life-truths the child can keep on the wall.`);
  o.push(`\nTHE ETHICAL LINE (non-negotiable): a story is a MIRROR, never a prediction of destiny. Each truth reflects who the child ALREADY is — never who they must become. No career, no relationship, no "you will be". No astrology jargon in the rule text itself. Practical test for every line: would it make the child feel TRAPPED by who they are, or SEEN in who they are? Keep only "seen".`);
  o.push(`\nCRAFT of each rule:
- A short second-person truth ("You feel all the way to the bottom — that is a gift, not a flaw."), 6–18 words, warm and plain.
- Draw each from ONE concrete chart feature and name it QUIETLY in a short "source" tag (e.g. "Scorpio Moon", "Cancer Sun", "Generator · Human Design", "Life Path 22", "— Vael walks beside you"). The source tag is the only place a placement may be named; never put jargon in the rule text.
- Pick DIFFERENT parts of the chart across the set — Sun, Moon, rising, Human Design type, the Chinese companion, a number. Depth and variety over repetition.
- Ground the imagery in the chart's ELEMENT; do NOT default every feeling-truth to "a wave" or "the sea".
- End the set on a practical, kind truth the child can use — never a verdict or a label.`);
  if (family) {
    o.push(`\nThis is a FAMILY compass: give at least one truth clearly belonging to EACH person (use their name in the source tag, e.g. "Nova · Cancer Sun"), then one or two shared truths that hold the whole family together. ${count} rules total.`);
  } else {
    o.push(`\nThis is one child's compass: exactly ${count} rules.`);
  }
  o.push(`\nLANGUAGE: write the title, subtitle and rules in ${lead}${others.length ? `, and you may let a phrase or two land in ${others.join(' or ')} where it feels natural` : ''}. Names are never translated.`);
  o.push(`\nReturn STRICT JSON ONLY — no markdown, no prose around it — in exactly this shape:
{"title":"a short warm title (may use the child's name)","subtitle":"one short line, e.g. six gentle truths written from her real stars","kicker":"from the sky of · DATE · PLACE","rules":[{"text":"the truth","source":"the quiet chart tag"}],"mirror":"A story is a mirror — not a map of the future."}`);
  return o.join('\n');
}

function buildPosterUser({ family, people, place, date }) {
  const lines = [];
  lines.push(family
    ? `Write a family little-compass for ${people.map(p => p.name).join(', ')}.`
    : `Write ${people[0].name}'s little compass.`);
  if (date || place) lines.push(`\nKicker facts: ${[date, place].filter(Boolean).join(' · ')}`);
  for (const p of people) lines.push(`\n— ${p.name}'s chart:\n${p.chart}`);
  lines.push(`\nReturn only the JSON object as specified.`);
  return lines.join('\n');
}

// The model is asked for strict JSON; be forgiving if it wraps it in fences or
// stray text, and pull out the first balanced {...} object.
function extractJSON(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}
