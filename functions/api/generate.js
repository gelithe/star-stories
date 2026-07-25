// ─── Star Stories · /api/generate ────────────────────────────────────────────
// Cloudflare Pages Function. Writes a personalized book from a child's real
// birth chart, in the register of the chosen edition and the chosen language
// mix, and STREAMS it back as house-style HTML. Mirrors the Chart Compass
// proxy pattern: key stays server-side, optional access-code gate, streaming
// (Cloudflare limits CPU time, not time spent waiting on the model).
//
// Environment variables (Cloudflare Pages → Settings → Environment variables):
//   ANTHROPIC_API_KEY    required — your Anthropic key (sk-ant-…). Set a spend cap.
//   ACCESS_CODES         optional — comma-separated codes; empty = OPEN (dev only).
//   GENERATE_MODEL       optional — model id (default below).
//   GENERATE_MAX_TOKENS  optional — cap per book (default 4000).
//
// NOTE: the craft prompt below is the product's IP. While this repo is public
// the prompt is readable by anyone — consider making the repo private before
// investing heavily in prompt quality (see DEPLOY.md / the architecture notes).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const codes = env => (env.ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  // Access gate (optional, mirrors Chart Compass). Empty ACCESS_CODES = open.
  const allowed = codes(env);
  if (allowed.length && !allowed.includes(String(body.accessCode || '').trim())) {
    return json({ error: 'Invalid or missing access code.' }, 401);
  }
  if (body.validateOnly) {
    return env.ANTHROPIC_API_KEY ? json({ ok: true }) : json({ error: 'Server is missing ANTHROPIC_API_KEY.' }, 500);
  }

  const key = env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: 'Server is missing ANTHROPIC_API_KEY.' }, 500);

  const spec = normalizeSpec(body);
  if (!spec) return json({ error: 'Missing birth/chart data.' }, 400);

  const system = buildSystemPrompt(spec);
  const user = buildUserPrompt(spec);

  const payload = {
    model: env.GENERATE_MODEL || DEFAULT_MODEL,
    max_tokens: Number(env.GENERATE_MAX_TOKENS) || 16000,
    system,
    messages: [{ role: 'user', content: user }],
    // Direct prose. Without this, Sonnet 5 runs *adaptive thinking* by default;
    // those thinking tokens count against max_tokens and are not emitted as
    // visible text, so a low cap yields stop_reason:max_tokens with an empty
    // body. (Accepted on Sonnet 5 and the Opus 4.x family; drop it if
    // GENERATE_MODEL is a model where thinking cannot be disabled.)
    thinking: { type: 'disabled' },
    stream: true,
  };

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  if (!upstream.ok || !upstream.body) {
    const e = await upstream.json().catch(() => ({}));
    return json({ error: e?.error?.message || `Anthropic HTTP ${upstream.status}` }, upstream.status || 502);
  }

  // Re-stream Anthropic SSE as plain text deltas (same shape the reader expects).
  // If no text ever arrives, surface the reason instead of a silent empty stream.
  const model = payload.model;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const dec = new TextDecoder(), enc = new TextEncoder();
      const emit = s => controller.enqueue(enc.encode(s));
      let buf = '', sawText = false, errMsg = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith('data:')) continue;
            const d = l.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            try {
              const ev = JSON.parse(d);
              if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta.text === 'string') {
                emit(ev.delta.text); sawText = true;
              } else if (ev.type === 'error') {
                errMsg = ev.error?.message || ev.error?.type || 'stream error';
              } else if (ev.type === 'message_delta' && ev.delta?.stop_reason && ev.delta.stop_reason !== 'end_turn' && !sawText) {
                errMsg = `stopped: ${ev.delta.stop_reason}`;
              }
            } catch { /* keep-alive / partial frame */ }
          }
        }
      } catch { errMsg = errMsg || 'stream interrupted'; }
      if (!sawText) {
        emit(`<div class="scene"><p><em>The generator returned no text${errMsg ? ' — ' + esc(errMsg) : ''}.</em></p>`
          + `<p class="echo">Check that ANTHROPIC_API_KEY is valid and that the model "${esc(model)}" is available on your plan (override with GENERATE_MODEL).</p></div>`);
      }
      controller.close();
    }
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' } });
}

// ─── SPEC ────────────────────────────────────────────────────────────────────
const LANG_NAMES = { LT: 'Lithuanian', IT: 'Italian', DE: 'German', EN: 'English' };

// The recurring cast — one signature companion per Chinese animal (see
// CHARACTERS.md). Same animal → same named character across every book.
const ZODIAC_COMPANIONS = {
  Rat:    { name: 'Pip',   essence: 'quick, curious, keeper of small shiny things' },
  Ox:     { name: 'Bo',    essence: 'steady, patient, carries the load calmly' },
  Tiger:  { name: 'Zuri',  essence: 'brave and warm, leaps first' },
  Rabbit: { name: 'Mella', essence: 'gentle, intuitive, hears feelings early' },
  Dragon: { name: 'Vael',  essence: 'big-hearted, imaginative, a little wild (small and friendly, never scary)' },
  Snake:  { name: 'Sema',  essence: 'wise, calm, sees in the dark' },
  Horse:  { name: 'Rio',   essence: 'free, roaming, loves the open' },
  Goat:   { name: 'Fenn',  essence: 'tender, artistic, a dreamer' },
  Monkey: { name: 'Ollo',  essence: 'playful, clever, turns problems into games' },
  Rooster:{ name: 'Kesh',  essence: 'proud, honest, wakes the day' },
  Dog:    { name: 'Baru',  essence: 'loyal, fair, guards the heart' },
  Pig:    { name: 'Pim',   essence: 'generous, warm, grounded' },
};
const ANIMALS = Object.keys(ZODIAC_COMPANIONS);
function companionFrom(chartText) {
  const m = new RegExp(`Chinese:\\s+(\\w+)\\s+(${ANIMALS.join('|')})`).exec(chartText || '');
  if (!m) return null;
  const c = ZODIAC_COMPANIONS[m[2]];
  return { element: m[1], animal: m[2], ...c };
}
const REGISTERS = {
  '0-2':  'Lullaby cadence — very few words per spread, sound and repetition, the images carry it. Read TO the baby.',
  '2-5':  'An animal fable — strong rhythm and repetition, a little creature who feels everything; a warm bedtime voice.',
  '6-8':  'A quest with short chapters; the child is the hero. Concrete, brave, a little funny; early self-reading.',
  '9-12': 'Adventure with first interiority — "your secret compass". Longer sentences, real feelings, private reading.',
  'teen': 'Honest and unpatronising — identity and intensity. No moralising, no baby-talk.',
  'ya':   'A letter to carry when leaving home — the parents\' book re-addressed to the young adult.',
  'adult':'A reflective portrait — the chart read back to the grown reader themselves, literary and unhurried.',
};
const MIX_SHAPES = {
  echo:               'Echo: every spread says one thing, once per language (lullaby repetition).',
  'rotating-lead':    'Rotating lead: each scene led by one language, closed by a one-line echo in another; a chant recurs in all languages.',
  'rotating-chapters':'Rotating chapters: each chapter led by one language with bridge echoes; the refrain always in every language.',
  'single-lead':      'Single lead: one language leads, with meaningful phrases from the others (family words stay family words).',
};
const SHAPE_FOR_AGE = { '0-2':'echo', '2-5':'rotating-lead', '6-8':'rotating-chapters', '9-12':'single-lead', 'teen':'single-lead', 'ya':'single-lead', 'adult':'single-lead' };
const SCENE_COUNT = { '0-2': 4, '2-5': 5, '6-8': 5, '9-12': 6, 'teen': 5 };
// Illustration motif vocabulary the model tags each scene with (see illustrate.js).
const MOTIFS_LIST = 'sea, mountain-sea, mountain, fog, sword, sun, moon, sky, cosmos, star, egg, forest, garden, door-home, boat, whale, companion, crown';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const sceneCount = e => SCENE_COUNT[e] || 5;

// Deterministic, per-scene language assignment — the model followed a loose
// "rotate the languages" instruction unreliably (led in English, skipped or
// added languages), so we compute the exact plan and hand it over as fixed rows.
function languagePlan(s, n) {
  const names = s.langs.map(c => LANG_NAMES[c]);
  const shape = SHAPE_FOR_AGE[s.edition];
  if (shape === 'single-lead') {
    const lead = names[0], others = names.slice(1);
    return `Every one of the ${n} scenes is narrated in ${lead}${others.length ? `, with short meaningful phrases from ${others.join(' and ')} where they land naturally` : ''}. The narration language never switches between scenes; family words stay in their own language.`;
  }
  if (shape === 'echo') {
    return `There are ${n} spreads. On EACH spread the single line is stated once in every language, always in this order: ${names.join(', ')}. Every language appears on every spread — none skipped, none added.`;
  }
  // rotating-lead / rotating-chapters
  const rows = [];
  for (let i = 0; i < n; i++) {
    const lead = names[i % names.length];
    const echo = names[(i + 1) % names.length];
    rows.push(`  • Scene ${i + 1}: body written FULLY in ${lead}${names.length > 1 ? `; closing one-line echo in ${echo}` : ''}`);
  }
  return `Write EXACTLY ${n} scenes. Each scene's body is written fully in its assigned language — the assignments are fixed, obey them exactly:\n${rows.join('\n')}\nEvery language in the set leads at least once; introduce no language outside the set.`;
}

function normalizeSpec(b) {
  if (!b || !b.birth || !b.chart) return null;
  const edition = REGISTERS[b.edition] ? b.edition : '6-8';
  const langs = Array.isArray(b.languages) && b.languages.length ? b.languages.filter(c => LANG_NAMES[c]) : ['EN'];
  const form = ['prose', 'poem', 'letter'].includes(b.form) ? b.form : 'story';
  const inputMode = ['surprise', 'details', 'theme'].includes(b.inputMode) ? b.inputMode : 'surprise';
  return {
    birth: {
      name: String(b.birth.name || 'the child').slice(0, 60),
      date: String(b.birth.date || ''), time: String(b.birth.time || ''), place: String(b.birth.place || ''),
    },
    chart: String(b.chart).slice(0, 4000),
    edition, langs, form, inputMode,
    parentsLang: LANG_NAMES[b.parentsLang] ? b.parentsLang : 'EN',
    details: b.details && typeof b.details === 'object' ? b.details : null,
    theme: b.theme ? String(b.theme).slice(0, 200) : null,
    isAdult: edition === 'adult' || edition === 'ya',
  };
}

// ─── PROMPTS ─────────────────────────────────────────────────────────────────
function buildSystemPrompt(s) {
  const langList = s.langs.map(c => LANG_NAMES[c]).join(', ');
  const shape = MIX_SHAPES[SHAPE_FOR_AGE[s.edition]];
  const out = [];
  out.push(`You are the author of "Star Stories" — personalized books written from a child's REAL birth chart (natal astrology + Human Design + Gene Keys + Chinese zodiac). You turn a chart into a story, never into a horoscope.`);
  out.push(`\nTHE ETHICAL LINE (non-negotiable): a story is a MIRROR, never a prediction of destiny. The chart gives the story its SHAPE — a child with a Scorpio Moon gets a hero who feels deeper than anyone knows — but the text NEVER tells the reader who they must become. No career predictions, no relationship fates, no "you will be". No astrology jargon in the story itself (that lives only on the parents' page). A child inherits a poem, not a box.`);
  out.push(`\nHOW TO READ THE CHART INTO STORY:
- Sun sign → the hero's core temperament and light.
- Moon sign → what the story is really ABOUT: the emotional engine, the inner weather.
- Ascendant (rising) → the opening image; how the hero first meets the world.
- The most-tenanted element/house, and any tight/hard aspect → the world's setting and the story's central tension-and-lesson (e.g. a Capricorn rising over a Pisces stellium becomes "a small mountain with an ocean inside").
- Human Design type → HOW the hero acts (a Generator responds to what lights them up; a Projector guides and is invited; a Manifestor initiates; a Reflector mirrors the room).
- Chinese sign → the COMPANION (named for you below): a creature embodying the animal, its year-element coloured into its nature. It arrives near the start, stays at the hero's side across MOST scenes, embodies the Human Design mode of acting, and is present at the resolution.
- Numerology (Life Path from the birth date; and Expression / Soul-Urge when a full name is present) → a quiet recurring number or rhythm — a refrain said N times, N companions, N doors — felt as pattern, never stated as a "meaning".
Choose a single vivid central metaphor from the chart; the metaphor and the companion recur on nearly every spread.`);
  const comp = companionFrom(s.chart);
  if (comp) out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. Use this exact name; ${comp.name} is a fixed character in the series. ${comp.name} may EARN a fuller name or title at the story's turning point — and if so, include a short, tender passage on WHERE that name comes from and what it means (do not merely announce it; the naming is the emotional pivot).`);
  out.push(`\nSTORY FLOW — the scenes are ONE continuous story, not separate vignettes: a clear arc from beginning to end. Scene 1 opens the tension the chart implies; each scene follows causally from the last; the middle turns on the companion and the central metaphor; the final scene RESOLVES the opening tension and lands home. The recurring chant threads through and returns at the close.`);
  out.push(`\nEDITION REGISTER: ${REGISTERS[s.edition]}`);

  if (!s.isAdult) {
    const n = sceneCount(s.edition);
    const forbid = s.langs.includes('EN') ? '' :
      ' English is NOT in the set — write no English anywhere, and never gloss a line in parentheses.';
    out.push(`\nLANGUAGES — the book is written ONLY in these, nothing else: ${langList}.${forbid}
The MAIN narrative text must actually BE in these languages — not one language sprinkled with words of the others. Any language outside the set is forbidden except for names and family words.
LANGUAGE PLAN (follow exactly — fixed assignments, not a suggestion):
${languagePlan(s, n)}
The recurring chant/refrain near the end appears once per line in EVERY language of the set — that block is the only place all languages sit together. Echo lines are re-tellings, not literal translations. Within a single scene's body do NOT mix two languages: the whole body is in that scene's one assigned language (only names and family words keep their own language).`);
    out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble, no <html>/<body> wrapper). Write EXACTLY ${n} scenes, numbered I…${ROMAN[n]}. Each scene is, in order:
<figure class="art" data-motif="KEY" data-scene="one short vivid visual line, in English, describing this scene for an illustrator"></figure>
<div class="ch-title">${ROMAN[1]} · Title</div>
<div class="scene"><p>…</p>… <p class="echo">closing echo (rotating shapes only; omit for a single-lead book)</p></div>
- KEY is ONE word chosen (best fit per scene) from: ${MOTIFS_LIST}.
- Optional transformation beat inside a scene: <div class="evolve">✦ NAME → NEWNAME ✦</div>
- After the last scene, the shared chant: <div class="spell">line per language<br>…</div>
- Then the parents' page, written ENTIRELY in ${LANG_NAMES[s.parentsLang]} and in no other language: <div class="parents"><h2>Title</h2><p>…2–4 short paragraphs, each naming ONE concrete chart feature (a placement, the Human Design type, the Chinese animal + companion, a Life Path number) and how it became a story beat…</p><p class="mirror">A story is a mirror, not a map of the future.</p></div>
Use ✦ not emoji.`);
  } else {
    out.push(`\nLANGUAGE: lead in ${LANG_NAMES[s.langs[0]]}${s.langs.length > 1 ? `, with meaningful phrases from ${s.langs.slice(1).map(c=>LANG_NAMES[c]).join(', ')} where they land naturally` : ''}. Names and family words are never translated.`);
    out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble), form = ${s.form}:` + adultOutput(s));
  }
  return out.join('\n');
}

function lengthGuide(edition) {
  return { '0-2':'4–5 very short spreads', '2-5':'5–6 short spreads', '6-8':'5–6 chapters', '9-12':'6–7 short chapters', 'teen':'5–6 sections' }[edition] || '5–6 chapters';
}
function adultOutput(s) {
  if (s.form === 'poem')
    return `\n<div class="ch-title">Title</div>\n<div class="poem">line<br>line<br><br>next stanza…</div>\nThen: <div class="parents"><p class="mirror">A story is a mirror, not a map of the future.</p></div>\nA lyric poem of 4–6 stanzas, image-led, drawn from the chart's central metaphor.`;
  if (s.form === 'letter')
    return `\n<div class="ch-title">Title</div>\n<div class="scene letter"><p>Dear ${s.birth.name},</p><p>…</p><p>— with love</p></div>\nThen: <div class="parents"><p class="mirror">A story is a mirror, not a map of the future.</p></div>\nAn honest, warm letter (250–450 words) — what the sky shows, addressed to them directly, never prescriptive.`;
  return `\n<div class="ch-title">Title</div>\n<div class="scene"><p>…</p>…</div>\nThen: <div class="parents"><p class="mirror">A story is a mirror, not a map of the future.</p></div>\nA reflective portrait in prose (350–550 words), literary, reading the chart back as character — closest to the Compass portraits.`;
}

function buildUserPrompt(s) {
  const lines = [];
  lines.push(`Write ${s.birth.name}'s book.`);
  lines.push(`\nBirth: ${s.birth.date}${s.birth.time ? ' ' + s.birth.time : ' (no time given — omit rising/houses)'}${s.birth.place ? ' · ' + s.birth.place : ''}`);
  lines.push(`\nComputed chart:\n${s.chart}`);
  if (s.inputMode === 'surprise') {
    lines.push(`\nMode: SURPRISE ME — derive the entire story from the sky; invent any needed texture yourself, kept true to the chart.`);
  } else if (s.inputMode === 'details' && s.details) {
    const d = s.details;
    const bits = [];
    if (d.crew) bits.push(`crew to include (as themselves, names kept): ${d.crew}`);
    if (d.familyWords) bits.push(`family words to keep untranslated: ${d.familyWords}`);
    if (d.treasure) bits.push(`a treasured object: ${d.treasure}`);
    lines.push(`\nMode: DETAILS — weave in without overriding the chart: ${bits.join('; ') || '(none provided — treat as surprise)'}.`);
  } else if (s.inputMode === 'theme' && s.theme) {
    lines.push(`\nMode: CHOSEN THEME — set the story in this world/value: "${s.theme}". The chart still shapes the character and the lesson; the theme sets the setting/metaphor layer only.`);
  }
  if (!s.isAdult) {
    lines.push(`\nReminder: obey the LANGUAGE PLAN exactly — the right languages, none skipped, none added, the parents' page in ${LANG_NAMES[s.parentsLang]} only. Keep the Chinese-zodiac companion present across scenes.`);
  }
  lines.push(`\nReturn only the HTML as specified.`);
  return lines.join('\n');
}
