# Case log — what was actually observed

The rules in `SKILL.md` are not general prompting advice. Each one was paid for
in a specific session working on the adult letter. This is the record, so a
future session can check whether a rule still holds rather than taking it on
faith — and so anyone about to reverse one knows what they are arguing with.

All examples are letters written for the same real chart (Gemini Sun in the
12th, Scorpio Moon in the 4th, Cancer rising, Projector with emotional
authority, Water Dog). Six versions, referred to as v1–v6.

---

## The Tuesday (rule 3 — the brief is live vocabulary)

A commit added this to the letter's second movement, to make it feel ordinary
rather than clinical:

> ...a pattern they may recognise on a Tuesday, not a flaw they are stuck with.

The next letter generated opened its third paragraph:

> **And then a Tuesday:** someone asks how you are and you say fine...

One round-trip, no other change. The owner spotted it before I did.

The same mechanism, milder, after the cut: the brief describes movement two as
"the same quality **running the other direction**", and the next letter opened
that movement with *"But there's **the other way it runs**."* This is the
evidence for "you cannot stop the leak, only choose what is in the pipe" —
after the concrete nouns were removed, what leaked was a structural phrase
nobody would notice, instead of a prop implying knowledge of her week.

**The wave is the counter-example worth knowing.** Three of six letters closed
on wave imagery in letters otherwise built from houses and drawers. Grepping
the brief for "wave" returns nothing — it comes from the chart line
`Human Design: Projector · Emotional`, which the model's training ties tightly
to wave language. Not every borrowed word is yours. Grep first; if it is not in
the brief, the fix (if any) is in what the chart summary sends, not in a rule.

---

## Five houses (rules 1 and 4 — sampling, and bulk suppressing variety)

v3, v4 and v5 were generated from a **byte-identical brief** — the prompt was
not touched between them. All three, plus v1 and v2 before them, chose the same
central image:

| | image | title |
|---|---|---|
| v3 | house / basement | The House Under the House |
| v4 | house / underneath | The House Underneath |
| v5 | house / room below | The Room Below the House |
| v6 (after the cut) | **a drawer** | The Drawer You Keep |

I concluded from the first five that the chart was simply architectural — four
planets in the 12th over a 4th-house Moon reads as hidden rooms under a home,
so any competent writer lands there. That was half right. After the brief was
cut from 7,670 to 5,527 characters, v6 found an entirely different picture for
the identical truth.

Two lessons, and the second is the one I missed at the time: differences
between samples of one brief are not craft signal (rule 1), **and** an
overlong brief narrows the space the model searches (rule 4).

---

## The duplication audit (rule 2 — subtract before you add)

Counted in the 7,670-character version:

| instruction | times stated |
|---|---|
| "don't be generic / only this person" | 5 (CRAFT ×2, shape note, output contract, self-check) |
| "one truth, one image" | 6 |
| "no astrology words on the page" | 4 — two of them the identical sentence |
| "keep it short / cut" | 3 |

Nothing was lost by reducing each to one statement. Seven craft bullets became
four.

Two deletions worth calling out specifically:

- *"a title promising a hundred must not sit on a story about nine"* — a book
  rule that had been inherited by the letter path, where it did nothing except
  donate two numbers to a chart that already leaks numbers.
- The reading aids quoted the Gene Keys shadow words as examples —
  *"Mediocrity", "Failure", "Inadequacy"*. Three ready-made labels sitting
  inside a brief whose central ethic is never to label anyone.

---

## Seams (rule 5 — describe the behaviour, not the phrase)

Three letters from one brief all opened the second movement with *"The cost
is that…"*. The brief was handing over the noun: the movement was headed **THE
TWO FACES** and described twice using the word "cost".

Adding "do not write 'the cost is'" would have been the wrong fix — the phrase
stays in context and the model routes around it into a synonym. What worked was
removing the word from the brief entirely (the movement became **THE SAME
THING, BOTH WAYS**) and describing the failure by what it does:

> A paragraph that opens by announcing what it is about to do has handed over
> its scaffolding instead of its scene — start every turn inside the picture,
> mid-thing.

No letter has opened with "the cost is" since.

---

## Where confident diagnosis of noise went wrong (rule 1)

Earlier in the same session, on a children's book rather than a letter: a Lars
story came back feeling disconnected. I attributed it to the per-chapter
language rotation and the companion's renaming, and was ready to change both.
The owner then produced a better story with **identical architecture** — same
rotation, same renaming.

The problem was never structural. Diagnosing from one output produced a
confident, specific, wrong answer, and the fix would have removed two things
that were working.

---

## What did not need fixing

Worth recording, because the instinct is to keep tuning:

- **Word count.** The instruction says 280–340 words. v6 came in at 309. It
  works; leave it.
- **The Chinese sign.** The rule "not a character, and it never speaks: at most
  one image" holds. v5 used it once — *"the way a rat lines a nest with bright
  scraps"* — and no letter has given it dialogue.
- **Invented biography.** v4 and v6 both named a specific Lithuanian city. This
  looked like confabulation worth fixing; it turned out to be in the customer's
  real form data, and was the personalisation working. **Check the input before
  calling something invented.**
