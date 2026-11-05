# What we built — Aerchain submission document

**Candidate:** Charu Jain  
**Assignment:** Kill the Quote Spreadsheet (Product take-home)  
**Category:** Corrugated packaging · RFx `CORR-2026-118` · 30 lines · 5 vendors  

Use this file as your **PPT outline** (one section = one slide) or export to PDF.

---

## Slide 1 — Problem

Procurement buyers lose **3–4 days** retyping vendor quotes from Excel, PDF, Word, email, and photos—then another day when leadership asks conditional award questions (e.g. split award with quality gate). We built the loop that **ends the quote spreadsheet**.

---

## Slide 2 — Solution (one flow)

1. **AI co-pilot** drafts RFx (scope, 30 lines, questionnaire, terms)  
2. **Send** to vendors (SMTP stubbed; demo uses bundled replies)  
3. **Ingest** any file shape → extract + normalize to **INR/box**  
4. **Compare** 30×5 grid with confidence, flags, questionnaire + attachments  
5. **Analyst** — natural language over extracted data → tables, charts, **CSV export**, defensible award math  

---

## Slide 3 — Demo scale (“hurts”)

| Dimension | Detail |
|-----------|--------|
| Lines | 30 SKUs |
| Vendors | 5 |
| Questionnaire | ISO, BRCGS, moisture, audit ≥ 80 |
| Attachments | XLSX, PDF, DOCX, rate card (SVG), email `.txt` |

---

## Slide 4 — Ugly edges (what we show buyers)

- **Per 100 boxes** vs per box (PackRight Excel)  
- **USD** + **5% footnote** discount (Global Carton PDF)  
- **27/30 lines** missing (Southern Board Word)  
- **Low confidence** rate card (DesiPack) + **fails quality**  
- **₹/kg email** + “same as last year” (QuickPack)  

System response: **flags**, **confidence**, **provenance snippet**, **review queue** — not silent wrong numbers.

---

## Slide 5 — Trust (₹4Cr narrative)

- Normalized grid cites **source text** per cell  
- Quality **gate** before split-award scenarios  
- Analyst answers **computed** from parsed data (not hardcoded)  
- **CSV exports** for audit trail (comparison, questionnaire, split award)  

---

## Slide 6 — Architecture

- **Next.js** UI + API routes  
- **Parser-first extraction:** SheetJS, pdf-parse, Mammoth, rules for email/SVG  
- **Normalization layer:** USD→INR, unit conversion, missing-line detection  
- **Analyst engine:** intent → query functions (split award, totals, review list)  
- **LLM escalation (v2):** gpt-4o-mini / gpt-4o vision when parser confidence low — not wired on public URL (cost, determinism, key safety); see `docs/DECISIONS.md`  

---

## Slide 7 — Live demo script (6 min)

1. Co-pilot → Generate RFx  
2. Mark sent  
3. **Load all 5 demo vendor files**  
4. Compare grid + questionnaire row  
5. Analyst: quality pass → **split award with quality filter** → export CSV  

(Full script: `docs/WALKTHROUGH.md`)

---

## Slide 8 — Deliberately left out

Vendor portal, real SMTP, ERP, production OCR, multi-tenant auth — scoped for **48h demo**; documented in `docs/DECISIONS.md`.

---

## Slide 9 — Deeper insight

Hardest long-term problem: **line matching** when vendors rename SKUs—not raw OCR. Next: buyer-in-the-loop matching + learning, then agentic re-quote on gaps.

---

## Links to include in submission email

| Item | You fill in |
|------|-------------|
| **Live app** | `https://YOUR-APP.vercel.app` (or Render) |
| **Video** | Loom or Google Drive link |
| **Source code** | GitHub repo (optional but recommended) |
| **This document** | PDF export of this file or Google Slides link |
