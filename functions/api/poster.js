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
  // A poster's job is to be KNOWN, not consulted, and a set someone actually
  // keeps in their head runs to about seven. So: seven for one person, and for
  // a household exactly one rule each plus a few shared — a count that explains
  // itself ("one for each of us, and three we share") and never passes eight.
  // A pair can carry two each and still sit at seven; from three people up it
  // is one each, or the sheet stops being memorable.
  const perPerson = !family ? 7 : (people.length === 2 ? 2 : 1);
  const shared = family ? (people.length <= 5 ? 3 : 2) : 0;
  const count = family ? people.length * perPerson + shared : 7;

  // Each person's Chinese sign. Without this the model only sees
  // "Chinese: Metal Ox" in the chart text and writes generic animals.
  const comps = people
    .map(p => { const c = companionFrom(p.chart); return c ? { person: p.name, ...c } : null; })
    .filter(Boolean);

  const group = people.length === 1 ? 'one person' : people.length === 2 ? 'a pair' : 'a household';
  const system = buildPosterPrompt({ family, people, lead, others, count, perPerson, shared, comps, group });
  const user = buildPosterUser({
    family, people, comps, lead,
    place: body.birth && body.birth.place,
    // A family poster must not be stamped with one person's birthday.
    date: family ? '' : (body.birth && body.birth.date),
    home: String(body.home || '').slice(0, 80).trim(),
  });

  const model = env.POSTER_MODEL || DEFAULT_MODEL;
  // The Fable/Mythos family rejects thinking:{disabled} with a 400 (thinking is
  // always on there) — same rule as /api/generate.
  const noThinking = /^claude-(fable|mythos)/.test(model);

  async function ask(userMsg) {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        // Generous: a family compass can run to ten rules in a long language,
        // and a truncated reply is unparseable JSON, which used to surface as
        // the unhelpful "came back empty".
        max_tokens: Number(env.POSTER_MAX_TOKENS) || 4000,
        system,
        messages: [{ role: 'user', content: userMsg }],
        ...(noThinking ? {} : { thinking: { type: 'disabled' } }),
      }),
    });
    if (!upstream.ok) {
      const e = await upstream.json().catch(() => ({}));
      return { httpError: e?.error?.message || `Anthropic HTTP ${upstream.status}`, status: upstream.status || 502 };
    }
    const data = await upstream.json().catch(() => ({}));
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJSON(text);
    return { parsed, rules: parsed && normalizeRules(parsed), text, stop: data.stop_reason };
  }

  let r = await ask(user);
  if (r.httpError) return json({ error: r.httpError }, r.status);

  // An even split is promised on the sheet ("N rules for five people") and a
  // child counts the lines that are theirs — but the instruction alone is not
  // always obeyed. Verify it, and give one corrective retry when it drifts.
  if (family && r.rules && r.rules.length) {
    const split = splitOf(r.rules, people);
    if (!isEvenSplit(split, people, perPerson)) {
      const got = people.map(p => `${p.name}: ${split.get(p.name) || 0}`).join(', ');
      const retry = await ask(user + `\n\nThe previous attempt did not divide the rules evenly — it produced ${got}. Every person must have EXACTLY ${perPerson}, no one more and no one fewer, plus EXACTLY ${shared} shared rules for the family, ${count} in total. Write it again with that split.`);
      if (!retry.httpError && retry.rules && retry.rules.length && isEvenSplit(splitOf(retry.rules, people), people, perPerson)) r = retry;
    }
  }

  const { parsed, rules, text } = r;
  if (!rules || !rules.length) {
    // Say WHY, so a failure is diagnosable instead of a shrug.
    const why = r.stop === 'max_tokens'
      ? 'the compass was cut off before it finished (raise POSTER_MAX_TOKENS)'
      : !String(text || '').trim() ? `the model "${model}" returned no text`
      : 'the compass came back in a shape we could not read';
    const peek = String(text || '').trim().slice(0, 180).replace(/\s+/g, ' ');
    return json({ error: `Poster failed — ${why}.${peek ? ' Model said: \u201C' + peek + '\u2026\u201D' : ''}` }, 502);
  }
  parsed.rules = rules;

  return json({
    title: String(parsed.title || (family ? 'Our Little Compass' : `${people[0].name}’s Little Compass`)).slice(0, 120),
    subtitle: String(parsed.subtitle || '').slice(0, 200),
    kicker: String(parsed.kicker || '').slice(0, 120),
    rules: parsed.rules.slice(0, count).map(r => ({
      text: String(r.text || r.rule || '').slice(0, 240),
      source: String(r.source || r.for || '').slice(0, 160), // a family tag can list five signs
    })).filter(r => r.text),
    mirror: String(parsed.mirror || 'A story is a mirror — not a map of the future.').slice(0, 160),
    // Solo posters show one companion; a family poster shows everyone's, so no
    // single person's animal stands in for the whole household.
    companion: family ? null : (comps[0] || null),
    companions: comps,
    family,
    group,
    // the companion page — same call, so it costs nothing extra
    behind: parsed.behind && typeof parsed.behind === 'object' ? {
      title: String(parsed.behind.title || '').slice(0, 140),
      people: Array.isArray(parsed.behind.people) ? parsed.behind.people.slice(0, 6).map(x => ({
        name: String((x && x.name) || '').slice(0, 60),
        note: String((x && (x.note || x.text)) || '').slice(0, 1200),
      })).filter(x => x.note) : [],
      shared: String(parsed.behind.shared || '').slice(0, 1600),
    } : null,
  });
}

// Which person each rule belongs to, read from the start of its source tag
// ("Nova Emi · Cancer Sun" -> Nova Emi). Longest names first so "Nova Emi" is
// not swallowed by a shorter "Nova".
function splitOf(rules, people) {
  const names = people.map(p => p.name).sort((a, b) => b.length - a.length);
  const counts = new Map();
  for (const r of rules) {
    const tag = (r.source || '').trim();
    const who = names.find(n => tag.toLowerCase().startsWith(n.toLowerCase()));
    if (who) counts.set(who, (counts.get(who) || 0) + 1);
  }
  return counts;
}
function isEvenSplit(counts, people, perPerson) {
  return people.every(p => (counts.get(p.name) || 0) === perPerson);
}

function buildPosterPrompt({ family, lead, others, count, perPerson, shared, group, people }) {
  const o = [];
  o.push(`You are the author of "Star Stories". You turn a child's REAL birth chart (natal astrology + Human Design + Gene Keys + Chinese zodiac + numerology) into a small printable poster called a "little compass" — a handful of gentle life-truths the child can keep on the wall.`);
  o.push(`\nTHE ETHICAL LINE (non-negotiable): a story is a MIRROR, never a prediction of destiny. Each truth reflects who the child ALREADY is — never who they must become. No career, no relationship, no "you will be". No astrology jargon in the rule text itself. Practical test for every line: would it make the child feel TRAPPED by who they are, or SEEN in who they are? Keep only "seen".`);
  o.push(`\nCRAFT — each line is a little LIFE RULE, and it works best in TWO PARTS: first a short recognition of who this child is, then what to do about it. The recognition makes the rule make sense; the rule is what stops it being just a description. Most drafts give only the first half — that is the thing to avoid.
  ✗ description alone: "Your feelings have their own wave-time." / "You start fast, like the first spring wind."
  ✓ recognition + rule: "You feel things all the way down — so when it gets big, wait for the wave to pass before you decide."
  ✓ recognition + rule: "Your ideas come in crowds. Write the new one down and keep going with the one in your hands."
  ✓ rule alone (also fine): "When you don't know what to do, say out loud what you like. Everything starts there."
Every line must contain something the child could actually DO. If a line only tells them what they are like, add the second half.
- 8–24 words, second person, warm, plain, and easy to read aloud. Naming the moment it applies ("When…", "If…", "On the days when…") is the usual bridge from the recognition to the rule.
- BOTH HALVES MUST BE ABOUT THE SAME THING. Whatever the line opens with, it must finish on that same subject — do not swap in a new image at the end. ✗ "When you want a new friend, ask someone a question out loud — a question opens doors." (starts on a friend, ends on doors). ✓ "When you want a new friend, ask them one question out loud — that is how it starts." Answer the situation you raised, plainly, and stop.
- The chart is WHY the rule fits this child; it never appears in the rule text. The short "source" tag is the only place a placement may be named.
- KEEP THE TAGS READABLE BY SOMEONE WHO KNOWS NO ASTROLOGY. Prefer the things anyone recognises: the Sun, Moon and rising signs ("Aries Sun", "Scorpio Moon", "Libra rising"), the Chinese sign ("Metal Ox"), and best of all the GENE KEYS GIFT words given in the chart — plain, warm and self-explanatory ("Patience", "Teamwork", "Delight", "Insight"). Never print bare technical codes: no profile numbers ("5/1", "4/6"), no "Generator Emotivo · Human Design", no gate numbers like "25.3". If a rule comes from Human Design, say what it means in two or three plain words instead ("decides with the body", "clear after the wave", "moves when invited"). A parent should understand every tag at a glance.
- NEVER print a Gene Keys SHADOW word ("Mediocrity", "Failure", "Inadequacy", "Self-Obsession", "Psychosis"). They are given only so you understand what the child struggles with; naming one on a poster would label a child with the worst word in their chart. Turn the shadow into the kind thing to DO about it, and tag the rule with the GIFT instead. Skip the mystical Siddhi words too ("Opalescence", "Synarchy", "Godhead") — they mean nothing to a family.
- A few Gift words are still a mouthful ("Transmutation", "Discrimination", "Bounteousness"). If a child could not say it, put it in plain words rather than printing the term.
- BE CONSISTENT ACROSS THE WHOLE POSTER. Whatever shape you choose for a tag, use it for every rule: if one reads "gift of Innovation", none may read a bare "Innovation" — a lone abstract noun looks like a stray word rather than something named. Same for capitalisation and for the separator.
- Draw each rule from a DIFFERENT part of the chart — Sun, Moon, rising, Human Design, the Chinese sign, a number — and give every rule a source tag.
- Nothing generic: if you could give the same rule to a different child, it does not belong on this poster.
- Say what TO do, not what to avoid. Kind, encouraging, never a warning or a verdict.
- THIS IS A SET TO BE KNOWN BY HEART, not a list to consult — that is why there are so few. Each rule must be short and distinct enough to remember without reading: no two rules covering the same ground, nothing that needs the poster in front of you to recall.
- THE POSTER MUST STAND ALONE. Many people will own only this sheet and no book, so it may never lean on anything from the stories — no character names, no invented creatures, nothing a stranger would not understand. When a rule uses someone's Chinese sign, name it plainly as element + animal ("your Wood Rat", "the Metal Ox in you"), exactly as given below. And such a rule still has to be doable and mean something on its face: "name them when you go far" sounds lovely and says nothing.`);
  if (family) {
    o.push(`\nThis is a FAMILY compass, and it must be EVEN-HANDED — a child counts the lines that belong to them. Give EXACTLY ${perPerson} rule${perPerson > 1 ? 's' : ''} to EACH person, no one more and no one fewer, then EXACTLY ${shared} shared rules for the whole family at the end. ${count} rules in total. The SUBTITLE must say the arrangement rather than only the total — "one rule for each of us, and ${shared} we share" in the poster's language — because that is what makes the number mean something instead of looking arbitrary.
Order them person by person (all of one person's rules together, in the order the charts are given), with the shared ones last. Start each source tag with that person's name ("Nova · Cancer Sun"); tag the shared ones for the family. A shared rule must be something the family DOES together, drawn from what their charts have in common.
This poster belongs to the whole household — do NOT make it one person's. No single birthday in the kicker (use the place, or the family), no title naming only one of them.`);
  } else {
    o.push(`\nThis is one child's compass: exactly ${count} rules.`);
  }
  o.push(`\nTHE SHEET BEHIND IT — besides the poster, write a short companion page for the grown reader: what in the real chart each rule came from. This is the one place the astrology may be named openly, the way a book's parents' page does.
- For EACH person: two to four sentences, in plain language, naming the actual placements (sign, house, Human Design, the Chinese sign, a Gene Keys gift) and saying which of their rules follows from what. Honest, warm, never flattering, never predictive.
- Then a short paragraph on what these ${group === 'one person' ? 'chart' : 'charts'} have in common and where the shared rules come from${group === 'one person' ? ' — for one person, what the seven rules together add up to' : ''}.
- Still the ethic: a mirror, never a map. Name the shadow honestly but never with a Gene Keys shadow word, and never as a label for who they are.
- Write it in ${lead}.`);

  o.push(`\nLANGUAGE: write the title, subtitle and rules in ${lead}${others.length ? `, and you may let a phrase or two land in ${others.join(' or ')} where it feels natural` : ''}. Names are never translated.`);
  o.push(`\nReturn STRICT JSON ONLY — no markdown, no prose around it — in exactly this shape:
{"title":${family ? '"a short warm title for the whole household — never one person\'s name alone"' : '"a short warm title (may use the child\'s name)"'},"subtitle":"one short line saying the arrangement, e.g. one for each of us and some shared","kicker":${family ? '"from the skies of · PLACE — no single birthday"' : '"from the sky of · DATE · PLACE"'},"rules":[{"text":"the rule","source":"the quiet chart tag"}],"mirror":"A story is a mirror — not a map of the future.","behind":{"title":"a title for the companion page","people":[{"name":"…","note":"2-4 sentences naming their real placements and which rule follows"}],"shared":"a paragraph on what these charts share and where the shared rules come from"}}`);
  return o.join('\n');
}

function buildPosterUser({ family, people, comps, place, date, home, lead }) {
  const lines = [];
  lines.push(family
    ? `Write a family little-compass for ${people.map(p => p.name).join(', ')}.`
    : `Write ${people[0].name}'s little compass.`);
  if (family) {
    // A household's members were born in different cities, so no birthplace
    // belongs in the kicker — the names, and the home they share, are what
    // they actually have in common.
    lines.push(`\nKicker: name the household — ${people.map(p => p.name).join(', ')}${home ? `, and that the poster hangs at: ${home}` : ''}. Put NO birthplace and NO birth date in it: they were not all born in the same city, so one place would be wrong for everyone else.`
      + (home ? ` Phrase the place naturally and grammatically in ${lead} — take care with the preposition and any article the language requires before that particular name.` : ''));
  } else {
    // The chart always comes from the birthplace; `home` is simply where the
    // poster will hang, which is often a different city — or country — now.
    const moved = home && place && home.toLowerCase() !== place.toLowerCase();
    if (date || place || home) {
      lines.push(`\nKicker facts — born${date ? ' ' + date : ''}${place ? ' in ' + place : ''}${moved ? `, living now in ${home}` : ''}.`
        + (moved ? ` Write the kicker so it holds both: the sky they were born under, and the home the poster hangs in.` : ''));
    }
  }
  if (comps && comps.length) {
    lines.push(`\nChinese signs (refer to them exactly like this — element + animal): ${comps.map(c => `${c.person} → ${c.element} ${c.animal}`).join('; ')}`);
  }
  for (const p of people) lines.push(`\n— ${p.name}'s chart:\n${p.chart}`);
  lines.push(`\nReturn only the JSON object as specified.`);
  return lines.join('\n');
}

// The model is asked for strict JSON; be forgiving if it wraps it in fences or
// stray prose, and pull out the first balanced {...} object. Brace counting is
// string-aware — a brace inside a rule's text must not end the object.
function extractJSON(text) {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null; // unbalanced → almost always a truncated response
}

// Accept the rules however they arrive: the agreed [{text, source}], bare
// strings, {rule,…}/{for,…} key variants, or nested one level down.
function normalizeRules(parsed) {
  let raw = parsed.rules;
  if (!Array.isArray(raw)) {
    const nested = Object.values(parsed).find(v => v && typeof v === 'object' && Array.isArray(v.rules));
    if (nested) { Object.assign(parsed, nested); raw = nested.rules; }
  }
  if (!Array.isArray(raw)) return null;
  return raw
    .map(r => (typeof r === 'string'
      ? { text: r, source: '' }
      : { text: String((r && (r.text || r.rule || r.truth)) || ''), source: String((r && (r.source || r.for || r.tag)) || '') }))
    .filter(r => r.text.trim());
}
