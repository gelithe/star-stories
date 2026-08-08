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
// A hero story is a different KIND of story at each age — not one size trimmed.
const ADVENTURE_SCALE = {
  '3-5':  'Small and warm. One simple task, one friend, one try that does not work and one that does. Everything close to home and safe, the ending happy and quick. No peril, no large world, no long journey.',
  '6-8':  'A true adventure with wonder in it: the hero sets out, meets something that will not give way to force, and comes through by courage and honesty. Real challenge, real effort, and a bright, satisfying win.',
  '9-12': 'A larger adventure driven by the hero\'s own choices — they decide, and the choice costs something. More inner life, higher stakes, an ending they clearly earned.',
  'teen': 'No magic needed. A real situation told honestly, with a genuine dilemma and no tidy moral tacked on — the truth is arrived at, never delivered.',
};
// Illustration motif vocabulary the model tags each scene with (see illustrate.js).
const MOTIFS_LIST = 'sea, mountain-sea, mountain, fog, sword, sun, moon, sky, cosmos, star, egg, forest, garden, door-home, boat, whale, companion, crown';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const sceneCount = e => SCENE_COUNT[e] || 5;

// The reader chooses the languages; the only fixed rules are "use exactly the
// chosen set" and "one language per chapter, never mixed inside one". How they
// are distributed is a craft decision left to the writer, so the book reads as
// a flow rather than a mechanical rotation. One chosen language = no mixing at
// all (the old fixed per-scene rotation made no sense for a single language).
function languagePlan(s) {
  const names = s.langs.map(c => LANG_NAMES[c]);
  const isVerse = bandFormat(s.edition).fmt === 'verse';
  if (names.length === 1) {
    return `The whole book is written in ${names[0]}, and in no other language — no glosses, no translations, no second language anywhere.`;
  }
  if (isVerse) {
    return `On each spread, the one image is said once in every language, in this order: ${names.join(', ')}. Each is a re-telling of the same image in that language's own way, never a stiff literal translation.`;
  }
  return `Use exactly these languages and no others: ${names.join(', ')}. Each one must lead at least one chapter.
ONE LANGUAGE PER CHAPTER — a chapter's body is written wholly in its own language, never two mixed together (names and family words always keep their own language).
You choose which chapter takes which language, so the book READS as one flowing story — not a mechanical rotation. Where it helps the flow, a chapter may close with a short one-line echo in another of the chosen languages.`;
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
  out.push(`\nREADING THE CHART — find ONE truth, not ten: the single thing that most defines this child, meaning what they are strongest at AND what that same strength costs them. Sun = their light; Moon = what they feel and how much; Ascendant = how they meet the world; the busiest element or house, or a tight hard aspect = the tension worth telling; Human Design = HOW they act (a Generator responds to what lights them up, a Projector sees and is invited, a Manifestor starts things, a Reflector mirrors the room); Chinese sign = the companion; numerology = a quiet recurring rhythm. Depth beats coverage: one truth, carried the whole way through. Astrology words NEVER appear in the story — they live only on the parents' page.`);

  out.push(`\nTHE TALE — write an ancient-feeling tale: simple, bright, and shaped like the stories that have always been told. Six beats, nothing more complicated:
1. A HERO — this child, with a real GIFT that comes from their chart.
2. A MISSION — something that matters and needs doing, which they are the one to do. Give them a reason to set out.
3. EFFORT — they try, it is hard, the first way does not work, and they keep going. Effort is the middle of the story.
4. THE SHADOW — what stands in the way is the other face of their own gift. It is not an enemy to be beaten: it loses its power the moment the hero ACKNOWLEDGES it, honestly and out loud.
5. THE GIFT USED — what was theirs all along turns out to be exactly what the mission needed.
6. THE MORAL — one clear line to carry out of the book, plain enough to remember.

TONE — bright, warm, brave. This is a tale, not an assessment. The child must close the book gladder and stronger than they opened it. Never a diagnosis, never sadness for its own sake, never a lonely wander, nothing bleak. Challenge yes, effort yes, darkness only as something the hero comes through.`);

  out.push(`\nORIGINALITY — every book must be unmistakably its own. The world, the opening, the mission, the images and the moral all come from THIS chart and this child's details; two different children must produce two books that share nothing but the house style. Never reach for a stock opening — no birthday party, no first day at a new school, no child standing apart from a crowd, no waking up in a bedroom — and never a stock feeling-image such as waves or the sea. If a sentence could appear unchanged in another child's book, rewrite it.`);

  out.push(`\nTHE VOICE — plain, easy words, understood on the FIRST read and read aloud without stumbling. Short sentences, everyday words, one idea at a time. Say feelings plainly; keep images simple and almost literal, never compressed or stacked into something that must be decoded. Clarity is the beauty. (Adult editions may be a little more literary — still clear.)`);
  const comp = companionFrom(s.chart);
  if (comp && isVerse) {
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. ${comp.name} is a fixed character in the series. In a lullaby ${comp.name} appears only softly — a warm presence beside the baby on a spread or two. Do NOT give ${comp.name} a naming pivot or a plot; this is too young for that.`);
  } else if (comp && titled) {
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. Use this exact name; ${comp.name} is a fixed character in the series (keep the animal). ${comp.name} has a touch of magic about it, embodies the child's Human Design way of acting, and never solves the mission for the hero — it goes with them, and it stays.
When the hero does something genuinely brave, ${comp.name} may grow into a fuller name — mark it <div class="evolve">✦ ${comp.name.toUpperCase()} → NEWNAME ✦</div>, and let the new name mean something the child can picture. Use this once or twice if the story earns it; never as a formula.`);
  } else if (comp) {
    // 3–5 fable: companion present throughout, delivers the gift simply — no naming pivot (too young for that move).
    out.push(`\nTHE COMPANION for this book is **${comp.name}**, a ${comp.element} ${comp.animal} — ${comp.essence}. Use this exact name; ${comp.name} is a fixed character in the series. ${comp.name} stays beside the little hero and, near the turn, delivers the story's gift in ONE simple line the child could repeat. Keep ${comp.name} steady — no name change, no long backstory.`);
  }
  if (isVerse) {
    out.push(`\nSHAPE — a lullaby is not a plot. The spreads are a gentle progression, not a story with tension and resolution: begin at the child arriving / the day softening, move through a few warm images drawn from the chart, and end at sleep ("goodnight, ${s.birth.name}"). No conflict, no lesson spelled out — just images and rest.`);
  } else {
    out.push(`\nSTORY FLOW — ONE continuous tale, not separate vignettes. Each scene follows from the one before it; the middle is the effort and the turn; the last scene resolves what the first set up and lands the moral. Carry the central image and the companion all the way through, and let the refrain return at the close.`);

    out.push(`\nHOW BIG THE ADVENTURE IS — a hero story is a different KIND of story at each age. Do not write one size and trim it:\n${ADVENTURE_SCALE[s.edition] || ADVENTURE_SCALE["6-8"]}`);
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
${languagePlan(s)}
${langTail}`);
    const bf = bandFormat(s.edition);
    const parentsName = LANG_NAMES[s.parentsLang];
    const parentsBlock = `<div class="parents"><h2>Title</h2><p>…2–4 short paragraphs, each naming ONE concrete chart feature (a placement, the Human Design type, the Chinese animal + companion, a Life Path number) and how it became a story beat. Name the child's GIFT, the SHADOW that is its other face, and the MORAL the tale lands on…</p><p class="mirror">A story is a mirror, not a map of the future.</p></div>`;
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
- KEY is only a picture-tag for the illustrator, chosen AFTER the scene is written — never let it shape the story. Pick the closest of: ${MOTIFS_LIST}.${bf.titles ? '\n- If the companion grows a fuller name, mark it inside that scene: <div class="evolve">✦ NAME → NEWNAME ✦</div>' : ''}
- After the last ${unit.replace(/s$/, '')}, the shared chant: <div class="spell">line per language<br>…</div>
- Then the parents' page, written ENTIRELY in ${parentsName} and in no other language: ${parentsBlock}
Use ✦ not emoji.`);
    }
  } else {
    out.push(`\nLANGUAGE: lead in ${LANG_NAMES[s.langs[0]]}${s.langs.length > 1 ? `, with meaningful phrases from ${s.langs.slice(1).map(c=>LANG_NAMES[c]).join(', ')} where they land naturally` : ''}. Names and family words are never translated.`);
    out.push(`\nOUTPUT — return ONLY clean HTML (no markdown, no preamble), form = ${s.form}:` + adultOutput(s));
  }
  // Last thing in the prompt, so it is the freshest instruction while writing:
  // the two failure modes that would actually hurt a child reading this.
  out.push(`\nBEFORE YOU WRITE, hold these two tests, and re-read your finished book against them:
1. IS IT A STORY, AND DOES IT LIFT? It must have a hero, something to do, effort, a turn, and a moral to carry away. It must leave the reader lighter and braver than they started. Nothing bleak, hopeless, lonely or sad-for-its-own-sake; no child left unhelped; no ending that merely stops. Hard things may happen — but always as something the hero comes THROUGH, and never the last note.
2. SEEN, NOT TRAPPED. Every line must reflect who this reader already is, never sentence them to who they must become.
If a passage fails either test, rewrite it before returning the book.`);

  return out.join('\n');
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
