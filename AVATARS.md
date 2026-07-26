# Companion avatars — lasting characters across the stories

The twelve zodiac companions are the **recurring cast** of Star Stories: a Rabbit
child always meets **Mella**, a Dragon child always meets **Vael**. This file is
how they stay *the same character* book to book — the "define once, appear
already-configured everywhere" model.

## The idea

A companion is an **avatar with fixed identity + variable dressing**:

- **Fixed (never changes):** name, animal, essence, signature look, the way it
  acts (it embodies the child's Human Design mode), its 3 canonical poses.
- **Variable (per book):** the year's Chinese **element** tints its palette, and
  the scene places it in the child's world.

Define the fixed part once, store a **reference** for it, and every book — text
and art — pulls from that one record.

## The registry (source of truth)

`assets/data/companions.json` holds all twelve as structured records:

```
{ "animal": "Dragon", "name": "Vael",
  "essence": "...", "look": "...", "action": "...",
  "prompt": "...(image prompt subject)...",
  "assets": { "sheet": null, "poses": {}, "higgsfield_character_id": null, "lora": null } }
```

`essence`/`look`/`prompt` are the definition; **`assets`** is the reference
material that makes the avatar reproducible. It starts empty and is filled once
the sheets are made.

## Where each field is consumed

| Layer | File | Reads |
|---|---|---|
| **Story text** | `functions/api/generate.js` (`ZODIAC_COMPANIONS`) | name + essence — Vael arrives, acts, may earn a fuller name |
| **House-style art** | `assets/js/illustrate.js` (`ART`) | the generic `companion` motif (vector) |
| **Painted art** | `functions/api/illustrate.js` (`COMPANION_LOOK`, `characterRef`) | name + look + the registered reference, so the *same* creature renders each scene |
| **Config / preview** | frontend | the registry, to show "your companion: Vael the Dragon" |

`name`/`essence`/`look` are intentionally mirrored in the two runtime Functions so
each stays self-contained (Cloudflare Functions don't share modules with
`assets/`). **Keep them in sync with `companions.json`** — it is the master.

## Authoring flow — turning a companion into a registered avatar

This is the once-per-companion step (run in Higgsfield; prompts in
`HIGGSFIELD-PROMPTS.md`):

1. **Generate** the primary portrait from the companion's prompt.
2. **Register it as a Character** in Higgsfield (or train a small Flux LoRA on
   its 3 poses) → you get a reusable **character id** / **LoRA name**.
3. **Store** it in `companions.json` → `assets.higgsfield_character_id` /
   `assets.lora`, and the chosen image URL → `assets.sheet`.
4. From then on, **reference every render** against that id — the avatar appears
   identical in every scene of every book.

```
prompt ──► Higgsfield portrait ──► register Character ──► id stored in registry
                                                              │
                     every scene render ◄───── reference the id  (consistency)
```

## Runtime consistency, today vs next

- **Today (no registered assets):** `functions/api/illustrate.js` appends each
  companion's **canonical look** whenever a scene names it — same description,
  much steadier renders, no training needed.
- **Next (registered assets):** pass the stored **character id / LoRA** as
  `characterRef` (and eventually point `GENERATE_IMAGE_MODEL` at a per-companion
  LoRA) — true character-locked consistency.

The seam is already in place: the reader sends the book's `companion` (Chinese
animal) to `/api/illustrate`, which pins the look now and will pass the
reference once `companions.json` carries one.

## Element tint

Applied per book, never baked into the reference sheet:

| Element | Wash |
|---|---|
| Wood | fresh new-leaf green |
| Fire | warm amber / ember |
| Earth | ochre / clay-gold |
| Metal | cool silver |
| Water | sea-teal / moon-silver |
