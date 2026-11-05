# Kill the Quote Spreadsheet — Aerchain PM take-home demo

Working prototype for the Aerchain product assignment: **corrugated packaging** RFx with **5 messy vendor responses**, real file parsing into a **30×5 comparison grid**, and a **natural-language analyst** that computes answers from extracted data (no hardcoded award numbers).

## Live demo path (recommended)

1. Start the dev server (see below) and open the app.
2. **RFx co-pilot** → Generate RFx draft (30 lines pre-seeded).
3. **Send** → Mark sent (SMTP stubbed).
4. **Ingest** → **Load all 5 demo vendor files** (bundled under `public/samples/vendors/`).
5. **Compare** → Review normalized INR/box, confidence, flags (USD, per-100, missing lines).
6. **Analyst** → Use suggested questions, especially split award with quality filter.

## Run locally

```bash
npm install
node scripts/generate-samples.mjs   # regenerates vendor mock files
npm run dev -- -p 4317
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Deliverables in repo

| Artifact | Path |
|----------|------|
| Prototype | This Next.js app |
| Walkthrough script | [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) |
| One-page decisions | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Submission guide + email template | [docs/SUBMISSION.md](docs/SUBMISSION.md) |
| PPT / document outline | [docs/WHAT_WE_BUILT.md](docs/WHAT_WE_BUILT.md) |

## Optional LLM

Extraction and analyst routing use **deterministic parsers + query engine** so the demo works offline. Set `OPENAI_API_KEY` for future LLM-assisted mapping (not required for the scripted demo).

## Regenerate samples

```bash
node scripts/generate-samples.mjs
```

Generates Excel, PDF, DOCX, SVG rate card, and email text with intentional edge cases.
