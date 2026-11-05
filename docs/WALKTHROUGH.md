# Recorded walkthrough script (~6 minutes)

Record screen while driving the app at `http://127.0.0.1:4317`.

## 0:00 — Hook

“Procurement teams lose a week to quote spreadsheets. This demo kills that loop for a 30-line corrugated RFx.”

## 0:30 — RFx co-pilot (tab 1)

- Click **Generate RFx draft**.
- Scroll 30 lines: “Co-pilot produced scope, SKUs, and embedded questionnaire criteria.”

## 1:00 — Send stub (tab 2)

- Click **Mark RFx sent** — explain email is stubbed for demo reliability.

## 1:20 — Ingest (tab 3)

- Click **Load all 5 demo vendor files**.
- Point at cards: Excel off-template, USD PDF, partial Word, rate card, email body.
- Call out warnings (27/30 lines, per-100, kg pricing).

## 2:30 — Compare (tab 4)

- Show grid: missing cells, confidence badges, USD/per-100 flags.
- “Everything normalized to INR per box from real parsed files—not retyped.”

## 3:30 — Analyst (tab 5)

Ask in order (click suggested chips):

1. **Which vendors passed the quality questionnaire?** — DesiPack / QuickPack fail.
2. **Split award: cheapest per line among vendors who cleared the quality questionnaire** — show table excerpt + total spend computed from data.
3. **Show cells that need buyer review** — kg conversion, angled card, etc.
4. **Compare single-vendor totals** — chart + table.

## 5:30 — Close

- Open `docs/DECISIONS.md`: stubbed email, real parsers, left-out production OCR/ERP.
- “Buyer stops clicking Excel and starts asking—and gets defensible, sourced answers.”

## Demo checklist before recording

- [ ] `npm run dev -- -p 4317` running
- [ ] Fresh session: restart server or POST `/api/session/reset`
- [ ] Ingest completed before analyst questions
