# Companion character sheets — generation pack

Twelve reference sheets, one per zodiac companion (see `CHARACTERS.md`). Each is
a **character reference** in the Star Stories house style: build it once, then
paste it as a character reference (Higgsfield / Midjourney) or train a small
LoRA per companion (Flux) so the figure stays itself book to book.

- **Output:** one sheet per companion (12 total), each showing **3 poses** —
  calm standing, mid-action, face close-up — on one page.
- **Aspect:** 3:2 landscape (reference-sheet layout). Upscale after.
- **Names never appear in the art** (they're set in type on the page).
- The sheets are **element-agnostic** (the neutral house palette). The year's
  Chinese element only tints a companion in a given book — see the tint note at
  the end; don't bake it into the reference.

## Shared style preamble (prepend to every prompt)

> Children's picture-book **character reference sheet**, Star Stories house
> style: fine hand-drawn ink linework in warm dark-brown (#2c2416) with
> gold-leaf accents (#c9a227) and soft translucent watercolour washes, on warm
> off-white paper (#faf7f0). Gentle rounded friendly forms, tender and calm,
> storybook illustration. Full-body character shown in **three poses on one
> sheet — calm standing, mid-action, and a face close-up** — centred, simple
> pale background, generous margin.

## Shared negative prompt

> text, words, letters, numbers, signature, watermark, logo, frame, border,
> harsh black outlines, neon colours, photorealistic, 3D render, plastic,
> glossy, scary, fangs, sharp teeth, extra limbs, deformed.

## The twelve prompts

Prepend the style preamble to each `subject` line below.

1. **Pip** — a small friendly **rat**: quick and curious, keeper of small shiny things. Tiny, bright wide eyes, a little satchel over one shoulder, a single gold whisker catching the light. Alert, gentle, mid-scurry in the action pose.
2. **Bo** — a calm friendly **ox**: steady, patient, carries the load without complaint. Broad and gentle, a soft woven bell at the neck, a slow warm gaze. Standing solid; in action, pulling a small wooden cart calmly.
3. **Zuri** — a warm friendly **tiger cub**: brave, leaps first. Rounded and soft (never fierce), one single bold stripe, playful eyes. Mid-leap in the action pose.
4. **Mella** — a gentle **rabbit**: intuitive, hears feelings early. Soft long ears, a moon-pale coat, a small star mark on the brow, tender listening expression. Sitting close and attentive.
5. **Vael** — a small friendly **wood dragon** (NOT scary): big-hearted, imaginative, a little wild. Small and rounded, scales that catch light, tiny soft wings, warm curious eyes. In action, a small gentle puff, wings half-open.
6. **Sema** — a wise calm **snake**: sees in the dark. Slender, coiled cosily, half-lidded knowing eyes, serene. Coiled at rest; in action, rising gently to look ahead.
7. **Rio** — a free-spirited small **pony/horse**: roaming, loves the open. Windswept mane, a small gold star hoof-mark, bright open expression. Mid-canter in the action pose.
8. **Fenn** — a tender artistic **goat**: a dreamer. Soft-curled coat, carries a little brush or a loop of coloured thread, gentle faraway gaze. In action, dabbing a small mark of colour.
9. **Ollo** — a playful clever **monkey**: turns problems into games. Bright eyes, long curling tail, always mid-idea, mischievous but kind. In action, hanging by the tail, reaching for something.
10. **Kesh** — a proud honest **rooster**: wakes the day. A crest like a small sunrise, stands tall and kind, warm not vain. In action, wings lifted mid crow-of-greeting.
11. **Baru** — a loyal fair **dog**: guards the heart. Shaggy warm coat, one ear up, carries a small lantern in its mouth or at its side. Sitting watchful; in action, trotting forward with the lantern.
12. **Pim** — a generous grounded **pig**: warm, content. Round and soft, gold-hoofed, an open honest face, a small smile. Standing content; in action, offering something small with both trotters.

## Element tint (only when a book calls for it)

| Element (birth year) | Wash to add over the neutral base |
|---|---|
| Wood | fresh new-leaf green |
| Fire | warm amber / ember glow |
| Earth | ochre / grounded clay-gold |
| Metal | cool silver, clean light |
| Water | sea-teal / moon-silver |

## Consistency workflow

1. Generate the 12 neutral sheets from the prompts above.
2. Pick the best per companion; upscale.
3. **Higgsfield / Midjourney:** register each as a character / paste its sheet as
   a character reference for every scene render.
4. **Flux + LoRA:** train one small LoRA per companion on its sheet (3–4 poses);
   the storefront's painted mode calls it by name.
