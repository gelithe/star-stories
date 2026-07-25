# Star Stories — Artist Brief & Style Bible

One visual identity, whether a scene is drawn by hand, generated in Midjourney/
ChatGPT, or rendered automatically by the storefront (Flux + LoRA). Hand this to
any illustrator; it is also the source of the `STYLE` string in
`functions/api/illustrate.js` — keep the two in sync.

## The look

- **Medium:** hand-drawn line + soft watercolour wash. Gold-and-ink line is the
  spine of the brand; colour is a gentle wash, never flat fill.
- **Palette:** ink `#2c2416`, gold `#c9a227` / deep gold `#9a7010`, warm off-white
  paper `#faf5ea`. One accent per book, chosen by the child's dominant **element**:
  - Fire → warm amber / terracotta
  - Earth → sage green / ochre
  - Air → pale sky-blue / silver
  - Water → sea-teal / moon-silver
- **Mood:** tender, unhurried, a little magical. Bedtime, not spectacle.
- **Composition:** generous negative space; a single clear focal image per spread;
  a small recurring gold star as a signature mark.
- **Never:** text or lettering inside the art; harsh outlines; busy backgrounds;
  cartoon-merch gloss; photorealism.

## The two constants of every book

1. **The central metaphor** — one image from the chart that the whole book grows
   from (e.g. Capricorn rising over a Pisces stellium → "a small mountain with an
   ocean inside"). It appears, in some form, on most spreads.
2. **The companion / talisman** — a creature embodying the child's **Chinese
   zodiac animal**, its element coloured into its nature (an Earth Pig: grounded,
   warm; a Water Rabbit: soft, intuitive). It has a name, stays at the hero's side
   across the book, and evolves with them. This is the character that most needs
   to stay consistent page to page.

## Character sheet (fill per book)

For the companion and the hero, define once and reuse:

- **Silhouette** — the shape you'd recognise in shadow.
- **Three or four fixed traits** — colour, one distinctive feature, eyes, a motif
  it carries (e.g. a gold star on the tail).
- **Two or three reference poses** — calm, active, close-up.

This sheet is what a LoRA is trained on (below), and what you paste as a character
reference in Midjourney / feed as the previous frame in ChatGPT.

## Per-scene shot list

The generator already emits, for each scene, `data-scene="<one vivid visual
line>"` and `data-motif="<key>"`. That line is the shot. Render it with: the
palette above, the book's element accent, the companion present where it fits,
and the central metaphor visible in the setting.

## Production routes

| Route | How | Consistency |
|---|---|---|
| **By hand / directed** (now) | Midjourney (character ref + style ref) or ChatGPT (feed the previous page: "same companion, now in the fog") | Character sheet + one seed/style ref per book |
| **Automated** (storefront) | Flux via `/api/illustrate` (Replicate). Base Flux gives the *look*; a **trained LoRA** per companion gives the *character* | Train one LoRA on the character sheet; call it from the generation function |

Honest limit: the pipeline directs, integrates and typesets — a human still
approves art before print for any premium/rendered edition while the models
mature.
