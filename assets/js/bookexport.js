// Star Stories — book export.
// Turns the rendered story (the HTML in #ssPaper, illustrations already filled)
// into a self-contained, print-ready A5 book file: a cover, one page per
// chapter, the shared chant, and the parents' page — styled to PRINT.md
// (154×216 mm = A5 + 3 mm bleed, safe margins). The reader offers it as a
// download; opened in any browser, Ctrl/Cmd-P → "Save as PDF" gives the PDF.
// (A server-side PDF render + email delivery is the storefront's next step.)

const BOOK_CSS = `
@page { size: 154mm 216mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #2c2416; background: #fff; }
.page { width: 154mm; min-height: 216mm; padding: 19mm; page-break-after: always;
  display: flex; flex-direction: column; justify-content: center; text-align: center;
  position: relative; overflow: visible; }
.page:last-child { page-break-after: auto; }
.page.cover { background: #10101c; color: #f2ead0; }
.cover h1 { font-size: 26pt; font-weight: normal; letter-spacing: .06em; line-height: 1.35; color: #f2ead0; }
.cover .sub { font-size: 10.5pt; color: #b8ac8f; margin-top: 9mm; line-height: 1.9; }
.cover svg { display: block; margin: 0 auto 8mm; width: 74mm; height: auto; }
.art { margin: 0 auto 7mm; }
.art svg, .art img { display: block; margin: 0 auto; width: 84mm; height: auto; border-radius: 3mm; }
.ch-title { font-size: 15pt; color: #9a7010; letter-spacing: .06em; margin-bottom: 6mm; }
.scene { font-size: 11.5pt; line-height: 1.8; text-align: left; }
.scene p { margin-bottom: 4.5mm; }
.verse { text-align: center; margin: 0 auto; }
.verse .line { font-size: 14pt; line-height: 1.7; margin-bottom: 5mm; color: #9a7010; }
.verse .line + .line { color: #6b5a3e; font-style: italic; font-size: 12.5pt; }
.echo { font-style: italic; color: #6b5a3e; font-size: 10.5pt; }
.evolve { text-align: center; color: #1a9eae; letter-spacing: .1em; margin: 5mm 0; font-size: 13pt; }
.spell { text-align: center; font-size: 13pt; color: #9a7010; letter-spacing: .04em; line-height: 1.95; margin: 6mm 0; }
.parents { justify-content: flex-start; padding-top: 20mm; text-align: left; }
.parents h2 { font-size: 13pt; color: #9a7010; letter-spacing: .09em; text-transform: uppercase; font-weight: normal; margin-bottom: 5mm; }
.parents p { font-size: 9.5pt; line-height: 1.65; margin-bottom: 3.5mm; color: #4a3d28; }
.parents .chart { font-family: 'Courier New', monospace; font-size: 8pt; line-height: 1.8; white-space: pre-wrap;
  background: #faf7f0; border: .5pt solid #e0d5bb; padding: 5mm; margin: 4mm 0; color: #5a4a30; }
.parents .mirror { color: #8a7860; font-style: italic; margin-top: 5mm; }
.spread-num { position: absolute; bottom: 12mm; left: 0; right: 0; text-align: center; font-size: 8pt; color: #c9b98f; }
`;

// Split the rendered story into A5 pages: each chapter (its figure + title +
// scene) is one page; the chant and the parents' page get their own.
function paginateStory(root) {
  const pages = [];
  let cur = [];
  const flush = () => { if (cur.length) { pages.push(cur.join('\n')); cur = []; } };
  for (const node of [...root.children]) {
    const cls = node.className || '';
    if (node.tagName === 'FIGURE') { flush(); cur.push(node.outerHTML); continue; }
    if (cls.includes('ch-title')) {
      // start a fresh page unless the only thing so far is this chapter's figure
      if (cur.length && !(cur.length === 1 && cur[0].startsWith('<figure'))) flush();
      cur.push(node.outerHTML); continue;
    }
    if (cls.includes('spell')) { flush(); pages.push(node.outerHTML); continue; }
    if (cls.includes('parents')) {
      // A lone mirror line (the adult letter) closes the page it is on; a real
      // parents' page gets its own sheet.
      if (cur.length && node.children.length === 1 && node.querySelector('.mirror')) { cur.push(node.outerHTML); continue; }
      flush(); pages.push(`<div class="page parents">${node.innerHTML}</div>`); continue;
    }
    cur.push(node.outerHTML); // scene / evolve / stray nodes
  }
  flush();
  // wrap non-parents pages
  return pages.map(p => p.startsWith('<div class="page parents"') ? p : `<div class="page">${p}<div class="spread-num"></div></div>`);
}

// The adult letter is not a book: no cover, no chapters, no parents' page —
// one A4 sheet you can hold, with the provenance in the letterhead so the page
// says who it is for and which sky it was read from.
const LETTER_CSS = `
@page { size: 210mm 297mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #2c2416; background: #fff; }
.sheet { width: 210mm; min-height: 297mm; padding: 22mm 28mm 18mm; display: flex; flex-direction: column; }
.mark { font-size: 7.5pt; letter-spacing: .22em; text-transform: uppercase; color: #b8a678; }
.ch-title { font-size: 19pt; font-weight: normal; color: #9a7010; letter-spacing: .03em;
  line-height: 1.3; margin: 6mm 0 3.5mm; }
.who { font-size: 9pt; color: #8a7860; letter-spacing: .04em; line-height: 1.7; }
.rule { border-top: .5pt solid #e0d5bb; margin: 6mm 0 7mm; }
.scene { font-size: 11pt; line-height: 1.75; text-align: left; }
.scene p { margin-bottom: 4.5mm; }
.scene p:last-child { margin-top: 7mm; color: #6b5a3e; font-style: italic; }
.poem { font-size: 12.5pt; line-height: 1.95; color: #3a3020; }
.parents { margin-top: auto; padding-top: 10mm; }
.parents .mirror { font-size: 9pt; font-style: italic; color: #8a7860; }
.parents h2, .parents .chart { display: none; }
`;

// Date in the language the letter leads in — it is their date, on their page.
const DATE_LOCALE = { LT: 'lt-LT', IT: 'it-IT', DE: 'de-DE', EN: 'en-GB' };
function letterDate(iso, langCode) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  try {
    return d.toLocaleDateString(DATE_LOCALE[langCode] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function letterSheet(paper, name, meta, lang) {
  // The written title heads the sheet; everything else is the letter itself.
  const nodes = [...paper.children];
  const titleNode = nodes.find(n => (n.className || '').includes('ch-title'));
  const title = titleNode ? titleNode.outerHTML : `<div class="ch-title">${escHtml(name)}</div>`;
  const body = nodes.filter(n => n !== titleNode && n.tagName !== 'FIGURE')
    .map(n => n.outerHTML).join('\n');
  const born = [letterDate(meta.date, lang), meta.time, meta.place].filter(Boolean).join(' · ');
  return `<div class="sheet">
  <div class="mark">Star Stories</div>
  ${title}
  <div class="who">for ${escHtml(name)}${born ? `<br>born ${escHtml(born)}` : ''}</div>
  <div class="rule"></div>
  ${body}
</div>`;
}

function coverPage(name, meta, element) {
  const hero = (typeof ART !== 'undefined') ? ART.motifSVG('mountain-sea', element) : '';
  const sub = [meta.date, meta.place].filter(Boolean).join(' · ');
  return `<div class="page cover">${hero}<h1>${escHtml(name)}</h1>
    <div class="sub">${escHtml(sub)}<br><br>a book written from a real sky</div></div>`;
}

function escHtml(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function slug(s) { return String(s || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book'; }

function exportBook() {
  const paper = document.getElementById('ssPaper');
  if (!paper || !paper.children.length) return;
  const name = (typeof state !== 'undefined' && state.name.trim()) || 'Star Stories';
  const element = (typeof state !== 'undefined' && state.element) || 'Water';
  const meta = {
    date: (typeof state !== 'undefined' && state.birthDate) || '',
    time: (typeof state !== 'undefined' && state.birthTime) || '',
    place: (typeof state !== 'undefined' && state.place) || '',
  };
  const isLetter = typeof state !== 'undefined' && state.age === 'ya';
  const lang = (typeof state !== 'undefined' && state.bookLangs && state.bookLangs[0]) || 'EN';

  const body = isLetter
    ? letterSheet(paper, name, meta, lang)
    : [coverPage(name, meta, element), ...paginateStory(paper)].join('\n');
  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escHtml(name)} — Star Stories</title><style>${isLetter ? LETTER_CSS : BOOK_CSS}</style></head>
<body>${body}</body></html>`;

  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug(name)}-${isLetter ? 'letter' : 'star-stories'}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
