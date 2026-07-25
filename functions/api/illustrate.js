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
  const prompt = `${scene}. ${STYLE}, ${tint}.`;
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
