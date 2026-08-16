# Handoff brief — read this first in a new session

You are picking up **Star Stories**: personalized children's books generated
from a child's real birth chart. Read `README.md`, `LANGUAGES.md`, `PRINT.md`,
`ILLUSTRATIONS.md`, then this file. Everything here was built and validated in
a previous session; trust the folder, not assumptions.

## State (as of handoff)

- Three handcrafted books exist in `books/` (HTML + print-ready PDF, A5+3mm
  bleed, SVG house-style illustrations, trilingual LT/IT/DE, parents' pages in
  Italian): Lars (7), Luis (5), Nova (2). Real charts, computed with `engine/`.
- `engine/compute.js` computes any chart: natal + Human Design + Gene Keys.
  It needs `npm install` (dep: astronomy-engine). Validated against AstroSeek.
- The sibling project Chart Compass (same owner) runs at compass.sagemodeai.com
  on Cloudflare Pages from the `cloudflare-app/` folder of gelithe/docs — its
  proxy pattern (`functions/api/chat.js`: server-side key, access codes,
  streaming) is the reference architecture for any AI-calling backend here.

## Owner's decisions already made

- Language choice is a product feature: buyers pick up to 4 book languages
  (start set LT/IT/DE/EN) + a parents'-page language. Mixing shapes per age
  are defined in LANGUAGES.md.
- Story-as-mirror ethic is non-negotiable (see README).
- v1 product = digital PDF; printed copy via POD (Gelato/Peecho, EU) later.
- SVG house style is the default illustration tier; richer art is a premium
  tier (see ILLUSTRATIONS.md).

## Next build: the storefront

Owner wants the full backbone: frontend + backend. Suggested v1 architecture
(mirrors the proven Chart Compass stack — Cloudflare Pages + Functions):

1. **Landing + configurator page**: child name, birth date/time/place
   (Nominatim autocomplete — port from Chart Compass), age band, language mix
   (up to 4), parents' language. Chart computes client-side (engine is
   browser-compatible) → instant "his sky" preview to build desire.
2. **/api/generate** function: Claude API (server-side key) writes the story
   from the chart + age register + language mix; HTML template typesets it;
   PDF rendering (Cloudflare Browser Rendering API, or queue + external
   renderer) → deliver by email link.
3. **Payments**: Stripe Checkout, one function to create the session, webhook
   to trigger generation. Digital product first; Gelato print API later.
4. Human review option: v1 can queue generated books for the owner's approval
   before delivery (quality gate while the prompts mature).

## Practical notes

- PDFs are rendered with headless Chromium: `--print-to-pdf`, page size from
  the file's `@page` rule.
- Emoji were deliberately removed from print files (inconsistent rendering);
  all art is inline SVG.
- The owner reads LT/IT/DE/EN; native-speaker review before print is the rule
  for any language the family doesn't speak.
