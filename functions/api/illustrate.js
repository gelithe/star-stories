// ─── Star Stories · /api/illustrate ──────────────────────────────────────────
// Painted-mode (opt-in) scene renderer. Given a one-line scene description, it
// asks an image model for a house-style illustration and returns { url }. The
// reader swaps the vector art for the image; on any failure it keeps the vector.
//
// Provider: Replicate (Flux). Key-gated — with no key it returns 501 and the
// reader silently falls back to the house style.
//
// Environment variables (Cloudflare Pages → Settings → Environment variables):
//   REPLICATE_API_TOKEN   required for painted mode (r8_… token).
//   GENERATE_IMAGE_MODEL  optional — default black-forest-labs/flux-schnell.
//   ACCESS_CODES          optional — same gate as /api/generate.
//
// The style suffix below is the machine half of ARTIST-BRIEF.md; keep them in
// sync so hand-drawn and rendered art share one visual identity. Character
// consistency (a trained LoRA per companion) is the next step — see the brief.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const codes = env => (env.ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean);

const STYLE = 'children\'s picture-book illustration, hand-drawn gold and ink line with soft watercolour washes, warm off-white paper, tender and gentle, storybook vignette, generous negative space, no text, no words, no lettering';
const ELEMENT_TINT = {
  Fire: 'warm amber and terracotta accents',
  Earth: 'sage green and ochre accents',
  Air: 'pale sky-blue and silver accents',
  Water: 'sea-teal and moon-silver accents',
};

// The recurring cast, by Chinese animal — name + fixed look (mirror of
// assets/data/companions.json; see AVATARS.md). When a scene features the
// companion, its canonical look is appended so the same creature is rendered
// every time; a trained LoRA / character reference (body.characterRef) is the
// stronger consistency lever once the avatars are registered.
const COMPANION_LOOK = {
  Rat:    { name: 'Pip',   look: 'a small rat with bright eyes, a little satchel and one gold whisker' },
  Ox:     { name: 'Bo',    look: 'a broad gentle ox with a soft woven bell and a slow warm gaze' },
  Tiger:  { name: 'Zuri',  look: 'a rounded soft tiger cub (never fierce) with one bold stripe and playful eyes' },
  Rabbit: { name: 'Mella', look: 'a soft long-eared rabbit with a moon-pale coat and a star mark on the brow' },
  Dragon: { name: 'Vael',  look: 'a small friendly wood dragon with light-catching scales, tiny soft wings and warm eyes' },
  Snake:  { name: 'Sema',  look: 'a slender calm snake, coiled cosily, with half-lidded knowing eyes' },
  Horse:  { name: 'Rio',   look: 'a small windswept pony with a gold star hoof-mark and a bright open face' },
  Goat:   { name: 'Fenn',  look: 'a soft-curled goat carrying a little brush or coloured thread, a dreamy gaze' },
  Monkey: { name: 'Ollo',  look: 'a bright long-tailed monkey, always mid-idea, mischievous but kind' },
  Rooster:{ name: 'Kesh',  look: 'a tall kind rooster with a crest like a small sunrise' },
  Dog:    { name: 'Baru',  look: 'a shaggy warm dog with one ear up, carrying a small lantern' },
  Pig:    { name: 'Pim',   look: 'a round content pig, gold-hoofed, with an open honest face' },
};

export async function onRequestOptions() { return new Response(null, { status: 204 }); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const allowed = codes(env);
  if (allowed.length && !allowed.includes(String(body.accessCode || '').trim())) {
    return json({ error: 'Invalid or missing access code.' }, 401);
  }

  const token = env.REPLICATE_API_TOKEN;
  if (!token) return json({ error: 'Painted mode needs REPLICATE_API_TOKEN on the server.' }, 501);

  const scene = String(body.scene || '').slice(0, 300).trim();
  if (!scene) return json({ error: 'Missing scene.' }, 400);
  const tint = ELEMENT_TINT[body.element] || ELEMENT_TINT.Water;

  // If this scene features the book's companion, pin its canonical look so the
  // same avatar is rendered across every scene and every book.
  const comp = COMPANION_LOOK[String(body.companion || '').trim()];
  let charBit = '';
  if (comp && new RegExp(`\\b${comp.name}\\b`, 'i').test(scene)) {
    charBit = ` The recurring companion ${comp.name} is ${comp.look} — keep it exactly consistent.`;
  }
  // Optional character reference: a LoRA trigger word or reference note stored
  // in the registry once the avatar is registered (Higgsfield / Flux LoRA).
  const ref = String(body.characterRef || '').slice(0, 120).trim();

  const prompt = `${scene}.${charBit} ${STYLE}, ${tint}.${ref ? ' ' + ref : ''}`;
  const model = env.GENERATE_IMAGE_MODEL || 'black-forest-labs/flux-schnell';

  try {
    // Prefer: wait blocks until the prediction resolves (no client polling).
    const r = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '4:3', output_format: 'webp', num_outputs: 1 } }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: data?.detail || `Replicate HTTP ${r.status}` }, 502);
    const url = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!url) return json({ error: 'No image returned.' }, 502);
    return json({ url });
  } catch (e) {
    return json({ error: 'Image request failed.' }, 502);
  }
}
