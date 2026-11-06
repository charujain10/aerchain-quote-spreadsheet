# Kill the Quote Spreadsheet — Aerchain PM take-home

One flow, end to end, for a **corrugated packaging** RFx (30 lines, 5 vendors):

**co-pilot drafts the RFx → email goes out (SMTP stubbed) → five messy replies are read by a model → one side-by-side comparison → the buyer interrogates it in plain language.**

The AI loops are real: there is **no fake mode**. The co-pilot, the reading of vendor replies and the analyst all call a live model (Gemini by default, which has a free tier; Anthropic also supported). Only the plumbing (SMTP) is stubbed.

## Run

```bash
npm install
cp .env.example .env.local      # add GEMINI_API_KEY (free: https://aistudio.google.com) or ANTHROPIC_API_KEY
npm run dev -- -p 4317          # http://127.0.0.1:4317
```

Model: `GEMINI_MODEL` (default `gemini-3.8-flash`; `gemini-3.6-flash` is the fallback) or `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). The model must support vision, PDF input and tool calling. Set `LLM_PROVIDER=gemini|anthropic` if both keys are present. `npm run samples` regenerates the vendor files and the ground truth (needs `python3` + Pillow for the photo).

Free tiers are rate-limited: the client waits out 429s automatically, so *Read all replies* may take a few minutes. Check the current limits and data-use terms for the free tier in Google AI Studio.

First read of each vendor file is a model call; repeats are served from `.cache/` (git-ignored) so a live demo is fast and repeatable.

## How it works

| Stage | What the model does | What code does |
|---|---|---|
| Co-pilot | Converses; calls `search_item_master`, `set_lines`, `set_terms`, `set_questionnaire`, `draft_vendor_email`, `finalize_rfx` | Holds the draft; refuses to finalize an incomplete RFx |
| Read replies | Reads the file in its original form (cells, PDF, Word text, the photo, email) → structured quotes **as written**, with a verbatim evidence quote, a confidence and any interpretation it made | Validates the schema, drops rows for unknown lines, checks evidence against the source text, converts unit/currency, applies unconditional discounts, caps confidence, assigns status |
| Quality gate | Answers the questionnaire from the vendor's own words; reads attachment facts (e.g. expiry dates) | Judges pass/fail/unknown/**conflict** (a certificate that contradicts an answer wins) |
| Analyst | Plans and calls tools (`compare_vendors`, `compute_award`, `get_prices`, …), then `present`s | All arithmetic and the award optimiser; renders tables/charts from tool results; flags any figure in the prose that is in no tool result |

Everything the model reports is *as stated*. Conversions, FX (buyer-editable), discounts, totals and award allocation are deterministic.

## Check it

- **In the app:** Compare → *Score vs ground truth*. The dataset is fabricated, so the right answer for all 145 priced cells is known; the panel reports accuracy and, more importantly, errors that were **not** flagged for review.
- **Wiring test (no API key needed):** proves the plumbing against a scripted stand-in for the API. It does not measure model accuracy.
  ```bash
  node tests/fake-anthropic.mjs &
  GEMINI_BASE_URL=http://127.0.0.1:9999 GEMINI_API_KEY=test npm run dev -- -p 4400
  npm run test:wiring        # (Anthropic path: ANTHROPIC_BASE_URL=... ANTHROPIC_API_KEY=test)
  ```
  Delete `.cache/` afterwards so the stand-in's output is never served as a real read.

## Layout

```
src/lib/llm.ts            provider-neutral client (Gemini / Anthropic), tool loop, forced-tool call, cache
src/lib/extract/          schema + file preparation + validation
src/lib/normalize.ts      units, FX, discounts, confidence caps, cell status
src/lib/qualify.ts        questionnaire gate (cleared/failed/unverified/conflict)
src/lib/award.ts          split / single / vendor-cap award engine, like-for-like comparison
src/lib/analyst/agent.ts  tool-calling analyst + figure verifier
src/lib/copilot.ts        RFx co-pilot tools
src/lib/eval.ts           score extraction against ground truth
scripts/                  sample + ground-truth generator
docs/DECISIONS.md         the one-page note · docs/WALKTHROUGH.md the recording script
```
