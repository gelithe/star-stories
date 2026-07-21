# Star Stories — storefront

A personalized children's book generated from a child's **real birth chart**,
retold as a story in the register of their age. This repo is the storefront
(frontend + backend), built on the stack proven by the sibling project
Chart Compass: **Cloudflare Pages + Functions**, chart computed **client-side**
in the browser, API keys server-side.

Product background, the language system, print specs and the illustration
strategy live in the handoff docs (`gelithe/docs/star-stories/`:
`HANDOFF.md`, `README.md`, `LANGUAGES.md`, `PRINT.md`, `ILLUSTRATIONS.md`).

## What's built now — the configurator

`index.html` is the landing + configurator page. It collects the birth data
and book options and renders an **instant "their sky" preview** the moment a
birth date is entered — the preview that sells the book.

- **Birth data** — child's name, date, optional time, birthplace with
  Nominatim autocomplete (ported from Chart Compass).
- **Edition** — the age band (0–2 … young adult), each with its reading
  register (from the handoff `README.md`).
- **Languages** — up to 4 book languages (LT/IT/DE/EN), with the age-specific
  *mixing shape* shown (Echo / Rotating lead / Rotating chapters / Single lead,
  per `LANGUAGES.md`), plus an independent parents'-page language.
- **Sky preview** — computes the natal chart, Human Design type and Chinese
  zodiac in the browser, and renders a house-style SVG vignette plus gentle,
  *mirror-not-destiny* copy (Sun/Moon/Rising, element, HD type, Chinese sign).

The chart engine (`assets/js/engine.js`) is the canonical Star Stories engine
(`gelithe/docs/star-stories/engine/chart.js`) adapted to run as a browser
script against the CDN `astronomy-engine` global. It is validated against a
known book chart (Lars: Sun Aries 13°02′, Moon Pisces 17°35′, ASC Capricorn
24°08′, Generator · Sacral · 4/6, Earth Pig) — see `Validation` below.

### The ethical line
Story as **mirror**, never prediction as destiny. The preview copy is
deliberately evocative and never predictive — no "you will be". A child
inherits a poem, not a box.

## Layout

```
index.html              landing + configurator
assets/
  styles.css            house style (gold/ink on warm white, Georgia serif)
  favicon.svg
  js/
    engine.js           natal + Human Design + Gene Keys + Chinese (browser)
    sky.js              product config (editions, language shapes) + preview copy + SVG
    configurator.js     form state, geocoding, timezone, live preview orchestration
```

External services used by the browser (same as Chart Compass): the
`astronomy-engine` CDN build, Nominatim (place autocomplete) and Open-Meteo
(`timezone=auto`). No build step — it's static.

## Run locally

Any static server works, e.g.:

```
python3 -m http.server 8080     # then open http://localhost:8080
```

(Requires internet for the CDN engine, place autocomplete and timezone lookup.)

## Validation

The browser engine was checked against Lars' book chart:

```
NODE_PATH=./node_modules node scripts/verify.js   # (astronomy-engine installed)
```

Output matches the values printed on the book's parents' page.

## Next build steps (from HANDOFF.md)

1. `/api/generate` Function — Claude (server-side key) writes the story from
   the chart + age register + language mix; HTML template typesets it; PDF via
   Cloudflare Browser Rendering. Mirrors `cloudflare-app/functions/api/chat.js`.
2. **Stripe Checkout** — one function to create the session, a webhook to
   trigger generation. Digital PDF first.
3. Owner-approval queue (quality gate while prompts mature).
4. Gelato/Peecho print API for the printed-copy upgrade.
5. Automated illustration: Flux + trained LoRA (Replicate / fal.ai) for
   character-consistent pages, directed by the `ARTIST-BRIEF` style bible.
```
