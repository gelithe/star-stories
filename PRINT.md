# Print readiness

## Current files (books/*.pdf)

- Page size: **154 × 216 mm** = A5 (148×210) + **3 mm bleed** on every side.
- All text and vital art sits ≥ 13 mm inside the trim line (safe zone).
- Full-bleed art (cover washes, waves) extends to the bleed edge — the printer
  trims 3 mm per side back to A5.
- Color: RGB PDFs (Chromium output). Print-on-demand services (Gelato, Lulu,
  Blurb, Peecho) accept RGB and convert to CMYK themselves. A traditional
  offset printer may ask for CMYK — tell them "RGB source, please convert",
  which is routine.

## What to tell a printer / POD service

- Trim size: **A5 portrait (148 × 210 mm)**, PDF includes 3 mm bleed, no crop marks.
- Binding: **saddle stitch** (these page counts are small) — page count must be
  a multiple of 4; add blank pages at the end if the service requires it.
- Paper: 150–170 gsm silk/matte inner pages; 250–300 gsm cover, optional matte
  lamination. For a board-book feel for Nova (age 2), POD board books are rare —
  a thicker inner stock (200 gsm) is the practical compromise.
- These are children's books read at bedside: matte > gloss.

## Suggested services

- **Gelato / Peecho** — API-friendly, EU printing (ships from Germany), good for
  future automation.
- **Lulu** — easy manual upload, saddle-stitch A5 supported, quality reliable.
- Any local Frankfurt print shop: hand them the PDF and the first paragraph above.

## Regenerating PDFs

Headless Chromium: `chrome --headless --print-to-pdf=book.pdf --no-pdf-header-footer book.html`
(page size comes from the file's `@page` rule — no flags needed).
