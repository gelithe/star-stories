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
//   GENERATE_MODEL       optional — force one model id for ALL editions (overrides the pen map below).
//   GENERATE_LYRIC_MODEL optional — model id for the lyric editions (0–2 verse + adult poem); default Fable 5.
//   GENERATE_MAX_TOKENS  optional — cap per book (default 16000).
//
// NOTE: the craft prompt below is the product's IP. While this repo is public
// the prompt is readable by anyone — consider making the repo private before
// investing heavily in prompt quality (see DEPLOY.md / the architecture notes).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5';        // the everyday pen: disciplined, cheap (~$0.07/book)
const LYRIC_MODEL   = 'claude-fable-5';       // the premium pen for lyric editions (~$0.23/book)

// Pick the model for a book. An explicit GENERATE_MODEL env var always wins;
// otherwise the lyric editions (the 0–2 lullaby's verse form, and the adult
// poem) get the lyric pen, everything else the everyday pen. Override the two
// defaults with GENERATE_MODEL / GENERATE_LYRIC_MODEL.
function modelForSpec(spec, env) {
  if (env.GENERATE_MODEL) return env.GENERATE_MODEL;
  const isVerse = !spec.isAdult && bandFormat(spec.edition).fmt === 'verse';
  const isPoem  = spec.isAdult && spec.form === 'poem';
  return (isVerse || isPoem) ? (env.GENERATE_LYRIC_MODEL || LYRIC_MODEL) : DEFAULT_MODEL;
}

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

  const model = modelForSpec(spec, env);
  // Direct prose. Without this, Sonnet 5 runs *adaptive thinking* by default;
  // those thinking tokens count against max_tokens and are not emitted as
  // visible text, so a low cap yields stop_reason:max_tokens with an empty body.
  // Sonnet 5 and the Opus family accept thinking:disabled; the Fable/Mythos
  // family REJECT it (400) — thinking is always on there — so omit it for them.
  const noThinking = /^claude-(fable|mythos)/.test(model);
  const payload = {
    model,
    max_tokens: Number(env.GENERATE_MAX_TOKENS) || 16000,
    system,
    messages: [{ role: 'user', content: user }],
    ...(noThinking ? {} : { thinking: { type: 'disabled' } }),
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
  '0-2':  'A lullaby to read TO a baby. Tiny: ONE image per spread, said as a short couplet — two or three words a line, sound and repetition over meaning. No chapters, no plot, no sentence longer than a breath. Think board book.',
  '3-5':  'A short animal fable for bedtime. Simple, concrete, playful, rhythmic — a little creature who feels everything. Two or three SHORT sentences per spread, strong repetition, one small lesson felt not told. Nothing abstract or literary.',
  '6-8':  'A quest with short chapters; the child is the hero. Concrete, brave, a little funny; early self-reading. Short paragraphs.',
  '9-12': 'Adventure with first interiority — "your secret compass". Longer sentences, real feelings, private reading.',
  'teen': 'Honest and unpatronising — identity and intensity. No moralising, no baby-talk.',
  'ya':   'A letter to carry when leaving home — the parents\' book re-addressed to the young adult.',
  'adult':'A reflective portrait — the chart read back to the grown reader themselves, literary and unhurried.',
};
// Per-band OUTPUT contract — this is what got lost when every age collapsed into
// one chaptered template. Grounded in the three handcrafted originals:
// Nova (0-2) ≈ 200 words of couplets; Luis (3-5) ≈ 390 words of short scenes;
// Lars (6-8) ≈ 520 words of short chapters. `words` is the cap PER SPREAD across
// ALL languages; `fmt` picks the shape; `titles` gates chapter headings.
const BAND_FORMAT = {
  '0-2':  { fmt: 'verse', titles: false, words: 35,  paras: '' },
  '3-5':  { fmt: 'scene', titles: false, words: 70,  paras: '2–3' },
  '6-8':  { fmt: 'scene', titles: true,  words: 110, paras: '3–4' },
  '9-12': { fmt: 'scene', titles: true,  words: 150, paras: '3–5' },
  'teen': { fmt: 'scene', titles: true,  words: 160, paras: '3–5' },
};
const bandFormat = e => BAND_FORMAT[e] || BAND_FORMAT['6-8'];
const MIX_SHAPES = {
  echo:               'Echo: every spread says one thing, once per language (lullaby repetition).',
  'rotating-lead':    'Rotating lead: each scene led by one language, closed by a one-line echo in another; a chant recurs in all languages.',
  'rotating-chapters':'Rotating chapters: each chapter led by one language with bridge echoes; the refrain always in every language.',
  'single-lead':      'Single lead: one language leads, with meaningful phrases from the others (family words stay family words).',
};
const SHAPE_FOR_AGE = { '0-2':'echo', '3-5':'rotating-lead', '6-8':'rotating-chapters', '9-12':'single-lead', 'teen':'single-lead', 'ya':'single-lead', 'adult':'single-lead' };
const SCENE_COUNT = { '0-2': 7, '3-5': 7, '6-8': 5, '9-12': 6, 'teen': 5 };
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
  const reqEd = b.edition === '2-5' ? '3-5' : b.edition; // legacy band id → new
  const edition = REGISTERS[reqEd] ? reqEd : '6-8';
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
  const isVerse = !s.isAdult && bandFormat(s.edition).fmt === 'verse';
  const titled = !s.isAdult && bandFormat(s.edition).titles; // 6–8, 9–12, teen
  const out = [];
  out.push(`You are the author of "Star Stories" — personalized books written from a child's REAL birth chart (natal astrology + Human Design + Gene Keys + Chinese zodiac). You turn a chart into a story, never into a horoscope.`);
  out.push(`\nTHE ETHICAL LINE (non-negotiable): a story is a MIRROR, never a prediction of destiny. The chart gives the story its SHAPE — a child with a Scorpio Moon gets a hero who feels deeper than anyone knows — but the text NEVER tells the reader who they must become. No career predictions, no relationship fates, no "you will be". No astrology jargon in the story itself (that lives only on the parents' page). A child inherits a poem, not a box.
Practical test for EVERY line: would it make this child feel TRAPPED by who they are, or SEEN in who they are? Keep only "seen".`);
  out.push(`\nTHE METHOD — build every book the same way; only the register (step 4) changes with age:
1. Read the chart for the ONE dominant truth — the single structural fact that most defines this child (a Moon that feels everything; a serious surface over an inner ocean; fire that only becomes itself with others). Do NOT cram ten placements — depth beats coverage. One truth per book.
2. Name its GIFT and its SHADOW together — deep feeling AND overwhelm, drive AND the lonely solo run. Honest, never flattering.
3. Turn it into a METAPHOR a child can hold — ONE concrete, physical thing from the everyday world. Draw the picture from the chart's dominant ELEMENT so books don't all look alike:
   • Fire → a spark, a campfire, a lantern, a coal that flares then settles
   • Earth → a seed, a garden, a small mountain, a stone that stays put
   • Air / Metal → the wind, a kite, a bell, a bird, a held breath
   • Water → rain that clears, a river that keeps going, a tide
   Do NOT default to "the sea" or "a wave" — that picture has been badly overused. Reach for it ONLY if the chart is strongly water-led, and even then choose the fresher image (rain, a river) over the generic wave.
   ANCHOR the metaphor so the child always knows what it MEANS. The image stands for a real, ordinary FEELING — so name that feeling plainly, in a child's words, and tie the image to it once, early: "Lars felt everything very deeply — so much inside that it felt like rain that wouldn't stop." After that anchor, trust the image. The ONLY thing forbidden is astrology JARGON ("Scorpio Moon", "Pisces stellium", "Generator") — plain emotion-words (too much, scared, left out, so much love, happy and sad at once) are the KEY that makes the picture make sense, never something to avoid. An un-anchored metaphor is a riddle; an anchored one is a gift the child understands.
4. Tell it in the age's REGISTER (given below).
5. END ON THE PRACTICAL GIFT — the one repeatable, kind thing that helps, and AGE-SCALE how it lands. For 0–5: SHOW the gift as one concrete thing the child or companion actually DOES (a hand held, three slow breaths blown out like candles, a light left on by the bed) — never a coping instruction, and never the grown-up moves of "naming" the feeling or being told to "wait for it to pass". From 6 up the gift may be said in one short line the child could repeat to themselves. A gift the child can use — never a verdict, a label, or a therapy technique in disguise.

Reading aids — use these only to FIND the one truth, not to list them all: Sun = core light; Moon = the emotional engine, usually where the truth lives; Ascendant = the opening image; the most-tenanted element/house or a tight hard aspect = the central tension (a Capricorn rising over a Pisces stellium → "a small mountain with an ocean inside"); Human Design type = HOW the hero acts (a Generator responds to what lights it up; a Projector guides and is invited; a Manifestor initiates; a Reflector mirrors the room); Chinese sign = the COMPANION (named below); numerology = a quiet recurring number/rhythm, felt as pattern, never explained as a "meaning".
The chosen metaphor and the companion recur on nearly every spread.`);

  out.push(`\nTHE VOICE — plain, easy words. This is the rule that decides whether the book actually READS well, and it outranks sounding poetic:
- Write so the child understands on the FIRST read, and a tired parent can read it aloud without stumbling. If a line needs a second read to be understood, it is too clever — rewrite it simpler.
- Short sentences. Everyday words a child already uses. One idea at a time.
- Say the feeling plainly. A metaphor must be SIMPLE and almost literal — "Inside, it felt like rain, and the rain had nowhere to go" — NOT compressed or writerly to the point of decoding ("a quiet warm rain gathered under his ribs and went nowhere"; "the rain got so loud he couldn't hear"). Avoid poetic body-locations ("under his ribs"), synaesthesia, and stacked abstractions.
- When the companion earns a new name, the meaning must be shown as a plain IMAGE the child can picture ("you're not a stone that holds the rain — you're the mountain where a river begins"), NEVER a definition of an abstract word ("a foundation is the bottom, the part you can't see").
- Clarity IS the beauty here. Never trade being understood for sounding literary. (The adult editions may be a touch more literary — but still clear.)`);
  const comp = companionFrom(s.chart);
  if (comp && isVerse) {
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. ${comp.name} is a fixed character in the series. In a lullaby ${comp.name} appears only softly — a warm presence beside the baby on a spread or two. Do NOT give ${comp.name} a naming pivot or a plot; this is too young for that.`);
  } else if (comp && titled) {
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. Use this exact name; ${comp.name} is a fixed character in the series. ${comp.name} stays at the hero's side across most scenes and embodies the child's Human Design way of acting. ${comp.name} may EVOLVE — earn a fuller name or title at the turning point — and if so, include a short, tender passage on WHERE that name comes from and what it means (do not merely announce it; the naming is the emotional pivot).`);
  } else if (comp) {
    // 3–5 fable: companion present throughout, delivers the gift simply — no naming pivot (too young for that move).
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. Use this exact name; ${comp.name} is a fixed character in the series. ${comp.name} stays beside the little hero and, near the turn, delivers the story's gift in ONE simple line the child could repeat. Keep ${comp.name} steady — no name change, no long backstory.`);
  }
  if (isVerse) {
    out.push(`\nSHAPE — a lullaby is not a plot. The spreads are a gentle progression, not a story with tension and resolution: begin at the child arriving / the day softening, move through a few warm images drawn from the chart, and end at sleep ("goodnight, ${s.birth.name}"). No conflict, no lesson spelled out — just images and rest.`);
  } else {
    out.push(`\nSTORY FLOW — the scenes are ONE continuous story, not separate vignettes: a clear arc from beginning to end. Scene 1 opens the tension the chart implies; each scene follows causally from the last; the middle turns on the companion and the central metaphor; the final scene RESOLVES the opening tension, lands home, and leaves the child with the practical gift (step 5). The recurring chant threads through and returns at the close.`);
  }
  out.push(`\nEDITION REGISTER: ${REGISTERS[s.edition]}`);

  if (!s.isAdult) {
    const n = sceneCount(s.edition);
    const forbid = s.langs.includes('EN') ? '' :
      ' English is NOT in the set — write no English anywhere, and never gloss a line in parentheses.';
    const langTail = isVerse
      ? `Each language's line is a re-telling of the same image, not a stiff literal translation — say it the way that language would. Names and family words are never translated.`
      : `The recurring chant/refrain near the end appears once per line in EVERY language of the set — that block is the only place all languages sit together. Echo lines are re-tellings, not literal translations. Within a single scene's body do NOT mix two languages: the whole body is in that scene's one assigned language (only names and family words keep their own language).`;
    out.push(`\nLANGUAGES — the book is written ONLY in these, nothing else: ${langList}.${forbid}
The MAIN narrative text must actually BE in these languages — not one language sprinkled with words of the others. Any language outside the set is forbidden except for names and family words.
LANGUAGE PLAN (follow exactly — fixed assignments, not a suggestion):
${languagePlan(s, n)}
${langTail}`);
    const bf = bandFormat(s.edition);
    const parentsName = LANG_NAMES[s.parentsLang];
    const parentsBlock = `<div class="parents"><h2>Title</h2><p>…2–4 short paragraphs, each naming ONE concrete chart feature (a placement, the Human Design type, the Chinese animal + companion, a Life Path number) and how it became a story beat. Name the ONE practical gift the story lands on — the repeatable, kind thing that helps…</p><p class="mirror">A story is a mirror, not a map of the future.</p></div>`;
    if (bf.fmt === 'verse') {
      out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble, no <html>/<body> wrapper).
This is a LULLABY, not a story. Write EXACTLY ${n} tiny spreads. NO chapter titles, NO paragraphs, NO plot — each spread is ONE image, said as a short couplet, once in every language of the set.
Each spread, in order:
<figure class="art" data-motif="KEY" data-scene="one short vivid visual line, in English, for the illustrator"></figure>
<div class="verse"><p class="line">first language — two very short lines<br>(the second line)</p><p class="line">next language — the same image, retold</p>… one <p class="line"> per language, in this fixed order: ${langList}</div>
- Each line is 2–6 words; at most two lines per language; keep the whole spread under ${bf.words} words across all languages.
- KEY is ONE word (best fit per spread) from: ${MOTIFS_LIST}.
- Do NOT add an echo line or a <div class="spell"> chant — saying the couplet once per language IS the refrain.
- After the last spread, the parents' page, written ENTIRELY in ${parentsName} and in no other language: ${parentsBlock}
Use ✦ not emoji.`);
    } else {
      const unit = bf.titles ? 'chapters' : 'spreads';
      const titleLine = bf.titles ? `\n<div class="ch-title">${ROMAN[1]} · Title</div>` : '';
      const brevity = bf.titles
        ? `Keep each chapter to ${bf.paras} short paragraphs, under ${bf.words} words total.`
        : `Keep each spread to ${bf.paras} SHORT sentences (under ${bf.words} words total). Simple, concrete, rhythmic — repetition is welcome; nothing literary or abstract.`;
      out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble, no <html>/<body> wrapper). Write EXACTLY ${n} ${unit}, numbered I…${ROMAN[n]}. Each ${unit.replace(/s$/, '')} is, in order:
<figure class="art" data-motif="KEY" data-scene="one short vivid visual line, in English, describing this scene for an illustrator"></figure>${titleLine}
<div class="scene"><p>…</p>… <p class="echo">closing echo (rotating shapes only; omit for a single-lead book)</p></div>
- ${brevity}
- KEY is ONE word chosen (best fit per scene) from: ${MOTIFS_LIST}.${bf.titles ? '\n- Optional transformation beat inside a scene, when the companion evolves: <div class="evolve">✦ NAME → NEWNAME ✦</div>' : ''}
- After the last ${unit.replace(/s$/, '')}, the shared chant: <div class="spell">line per language<br>…</div>
- Then the parents' page, written ENTIRELY in ${parentsName} and in no other language: ${parentsBlock}
Use ✦ not emoji.`);
    }
  } else {
    out.push(`\nLANGUAGE: lead in ${LANG_NAMES[s.langs[0]]}${s.langs.length > 1 ? `, with meaningful phrases from ${s.langs.slice(1).map(c=>LANG_NAMES[c]).join(', ')} where they land naturally` : ''}. Names and family words are never translated.`);
    out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble), form = ${s.form}:` + adultOutput(s));
  }
  return out.join('\n');
}

function lengthGuide(edition) {
  return { '0-2':'6 tiny spreads', '3-5':'5–6 short spreads', '6-8':'5 short chapters', '9-12':'6 short chapters', 'teen':'5 sections' }[edition] || '5–6 chapters';
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
