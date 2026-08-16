---
name: prompt-craft
description: How to change the Star Stories generator brief without making it worse — the craft prompt in functions/api/generate.js that turns a birth chart into a book or a letter. Use this skill whenever you are about to edit that prompt, diagnose a story or letter that came back wrong, add a rule to stop the generator doing something, or judge whether generated output represents a real regression. Also use it when someone shares a generated book, letter or poem and asks what is wrong with it, or asks why two runs came out differently. These lessons were paid for in wasted iterations; read them before touching the brief.
---

# Changing the brief without making it worse

The brief in `functions/api/generate.js` is the product. It is assembled per
band and form by `buildSystemPrompt()` / `buildUserPrompt()`, so **reading the
source does not tell you what the writer sees**. Read the assembled thing:

```bash
node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --band ya
node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --all       # sizes per band
node .claude/skills/prompt-craft/scripts/dump-prompt.mjs --band ya --grep wave
```

No API call, no credits. Do this before and after every change.

## What the writer actually is

One model call. No memory of any previous book or letter, no examples, nothing
but the assembled brief and the chart. Sampling is at the API default, so the
same brief never produces the same text twice.

Two consequences that are easy to forget and expensive to relearn:

- Nothing you "taught it" last run carried over. Every improvement is a file edit.
- Two outputs differing is the normal case, not a signal.

## The five rules

### 1. One sample is not evidence

Before concluding that output is a regression, ask what changed in the brief.
If nothing did, the difference is sampling. Get three or more samples from the
same brief before diagnosing, and when you cannot, say "this may just be
variance" out loud rather than fixing it.

The failure mode is confident diagnosis of noise: writing a rule to fix
something that was never broken, which then leaks (see rule 3) and breaks
something that was.

### 2. Subtract before you add

The instinct on seeing bad output is to add a rule. Check first whether the
rule is already in there — usually it is, two or three times, and the problem
is something else. Count before you write.

A real audit of this brief found "don't be generic" stated five times across
four blocks, "one truth, one image" six times, and "no astrology words on the
page" four times, twice as the identical sentence. Cutting it from 7,670 to
5,527 characters lost nothing.

`AGE-BANDS.md` says it plainly: *if a brief is growing longer, it is probably
getting worse.*

### 3. Everything in the brief is live vocabulary

The model does not read your instructions and then write from a blank slate.
Your words are in its context and it reaches for them. A concrete noun in the
brief will turn up in the output.

This was demonstrated in a single round-trip: the phrase *"a pattern they may
recognise on a Tuesday"* went into the brief; the next letter opened a
paragraph with *"And then a Tuesday:"*.

So when output borrows a word, **grep the brief for that word before writing a
rule about it** (`--grep`), and delete the source rather than forbid the
symptom. Forbidding keeps the word in context and adds new nouns of your own.

You cannot stop the leaking — only choose what is in the pipe. Abstract
instructions leak structure, which is harmless. Concrete instructions leak
props, which makes the book look like it knows something it doesn't.

### 4. Bulk suppresses variety, not just quality

An overlong brief does not merely risk sounding templated. It crowds the
context and narrows what the model can reach for.

Five consecutive letters from the same chart all chose the same central
metaphor. That looked like the chart being unambiguous. After the brief was cut
by 28%, the next letter found a completely different image for the same truth.
The convergence was partly the brief's bulk.

### 5. State rules positively

Prohibitions make the model write defensively and keep the forbidden thing
active in context. Describe what good looks like instead. The owner's standing
instruction: *don't ban anything — banning isolates and makes it too bounded.*

Where you must name a failure, describe what it *does* ("a paragraph that opens
by announcing what it is about to do") rather than listing phrases to avoid.
The model can recognise a behaviour in its own draft; a blocklist it will
simply route around.

## What you can move, and what you can't

Prompt work raises the **floor** and widens the **range**. It does not raise the
ceiling — the best sentence in the whole of one long session came from the very
first draft, before anything was fixed.

So "is it good enough to ship" is a question about the *worst* output you would
accept, which means it can only be answered from a batch. Judging one sample at
a time cannot answer it, however many samples you look at one at a time.

## Verifying without spending credits

Almost everything worth checking can be checked locally:

- **The brief** — `dump-prompt.mjs`, above.
- **Band regressions** — dump every band and confirm the child bands are
  untouched when you meant to change only the adult one.
- **Export and reader** — drive `index.html` with Playwright, paste known-good
  HTML into `#ssPaper`, and call `paginateStory()` / `letterSheet()` /
  `buildSpreads()` directly. This renders real print output from pasted text
  with no generation at all.

Reserve real API calls for questions only real output can answer — which is
mainly "what does a batch of five look like", never "did my edit apply".

## Before you commit

- Dump the brief again and diff it against the previous dump.
- Check the other bands still render (`--all`).
- Grep for any concrete noun you introduced. If you added one, ask whether the
  instruction survives without it.

`references/evidence.md` has the case log — what was tried, what happened, and
the outputs that proved each rule. Read it if you want the receipts, or if a
rule here seems wrong and you are about to reverse it.
