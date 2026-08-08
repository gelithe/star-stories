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
index.html              landing + configurator + reader/poster overlays
assets/
  styles.css            house style (gold/ink on warm white, Georgia serif)
  reader.css            the on-screen book: paper, page-turn spreads, mode toggle
  poster.css            the "little compass" poster add-on
  favicon.svg
  data/
    companions.json     canonical avatar registry — the 12 zodiac companions
  js/
    engine.js           natal + Human Design + Gene Keys + Chinese (browser)
    sky.js              product config (editions, language shapes) + preview copy + SVG
    configurator.js     form state, geocoding, timezone, live preview orchestration
    illustrate.js       house-style vector art (motif → SVG, tinted by element)
    reader.js           streams the book; page-turn (default) + scroll modes
    bookexport.js       print-ready A5 book download (→ Save as PDF)
    poster.js           the life-rules poster: calls /api/poster, A3 download
functions/api/
  generate.js           the book: chart → house-style HTML, streamed (the craft prompt)
  illustrate.js         painted-mode scene renderer (opt-in, key-gated)
  poster.js             the "little compass" life-rules generator
reference-books/
  lars-6-8-original.md  golden reference — the handcrafted book, annotated
scripts/verify.js       validates the chart engine against Lars' known chart
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

**Shipped since:** `/api/generate` (the book, streamed), the reader with
page-turn + scroll modes, the A5 book download, the 12-companion avatar
registry, painted mode (`/api/illustrate`, key-gated), and the life-rules
poster add-on (`/api/poster`).

**Next:**

1. **Stripe Checkout** — one function to create the session, a webhook to
   trigger generation. Digital PDF first.
2. Owner-approval queue (quality gate while prompts mature).
3. Server-side PDF render (Cloudflare Browser Rendering) + email delivery, so
   the buyer gets a PDF rather than an HTML file to print themselves.
4. Gelato/Peecho print API for the printed-copy upgrade.
5. Family compass — `/api/poster` already accepts multiple charts (`people[]`);
   the UI only sends one.
5. Automated illustration: Flux + trained LoRA (Replicate / fal.ai) for
   character-consistent pages, directed by the `ARTIST-BRIEF` style bible.
```
