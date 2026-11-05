---
marp: true
theme: default
paginate: true
title: Kill the Quote Spreadsheet
description: Aerchain Product Take-home — Charu Jain
style: |
  section { font-size: 28px; }
  h1 { color: #0f766e; }
  table { font-size: 22px; }
---

<!-- _class: lead -->

# Kill the Quote Spreadsheet

**Aerchain Product Take-home**

Charu Jain · Corrugated packaging RFx `CORR-2026-118`

---

## The problem

- Buyers lose **3–4 days** retyping quotes from Excel, PDF, Word, email, and photos
- Leadership asks: *“Split award — cheapest per line — only vendors who passed quality”* → **another day in Excel**
- Everyone treats it as cost of doing business — **this demo ends that loop**

---

## One flow, end to end

1. **AI co-pilot** → RFx (30 lines, questionnaire, terms)
2. **Send** to 5 vendors (email stubbed for demo reliability)
3. **Ingest** messy replies → **real parsers**, no forced template
4. **Compare** → one grid, INR/box, confidence + flags
5. **Analyst** → natural language → tables, charts, **CSV export**, award math

---

## Demo scale (built to hurt)

| | |
|---|---|
| **Category** | Corrugated packaging |
| **Lines** | 30 SKUs |
| **Vendors** | 5 |
| **Questionnaire** | ISO, BRCGS, moisture, audit ≥ 80 |
| **File types** | XLSX, PDF, DOCX, rate card, email |

---

## Ugly edges we designed for

| Vendor | Challenge |
|--------|-----------|
| PackRight | Off-template Excel · **INR per 100 boxes** |
| Global Carton | **USD** PDF · **5% footnote** discount |
| Southern Board | Word prose · **27/30 lines** |
| DesiPack | Angled rate card · **fails quality gate** |
| QuickPack | **₹/kg email** · “same as last year” |

**Buyer sees:** confidence, flags, provenance — not silent wrong numbers

---

## Trust (₹4 crore on the line)

- Every price ties to a **source snippet** from the attachment
- **Quality gate** before split-award scenarios
- Analyst runs **computed queries** on extracted data — not hardcoded demo answers
- **CSV exports:** comparison, questionnaire, split award

---

## Architecture

```
Vendor files → Parsers (XLSX / PDF / DOCX / rules)
            → Normalize (USD, UOM, gaps)
            → 30×5 grid + questionnaire
            → NL analyst (split award, totals, review queue)
            → CSV export
```

**LLM v2:** gpt-4o-mini + vision on low-confidence only — not on public demo URL (determinism, cost, key safety)

---

## Live demo path (6 minutes)

1. Co-pilot conversation → Generate RFx
2. Mark sent to vendors
3. **Load all 5 demo vendor files**
4. Compare + questionnaire & attachments
5. Analyst: **who passed quality?** → **split award with quality filter** → export CSV

---

## What we left out (48h scope)

- Real SMTP / vendor portal
- ERP posting & legal award workflow
- Production camera OCR (rate card simulated; v2 = vision + human confirm)
- Multi-tenant auth

Documented in **DECISIONS.md**

---

## Product insight

> The hard problem isn’t OCR — it’s **matching vendor language to canonical RFx lines**.

**Next:** buyer-in-the-loop line matching → learn corrections → agentic re-quote on gaps

---

<!-- _class: lead -->

## Submission

| | Your link |
|---|-----------|
| **Live app** | *(deploy URL)* |
| **Walkthrough video** | *(Loom / Drive)* |
| **Source** | *(GitHub — optional)* |

**Thank you — happy to walk through live.**
