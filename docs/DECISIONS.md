# One-page decisions (Aerchain take-home)

## What we built

- **Live-demo-first flow**: RFx co-pilot (multi-turn) → stub send → one-click ingest of five bundled vendor artifacts → comparison grid → NL analyst → **CSV exports**. SMTP/email is explicitly stubbed; ingestion is the hero.
- **Category**: Corrugated packaging, RFx `CORR-2026-118`, 30 SKUs with realistic specs and qty.
- **Real extraction**: Format-specific parsers (XLSX, PDF, DOCX, SVG text layer, email) produce line-level prices and questionnaire fields. Normalization converts USD, per-100-box, and ₹/kg email lines into INR/box with confidence + flags.
- **Real reasoning**: Analyst answers compile from normalized cells (split award, qualified-vendor filter, totals, low-confidence review, missing lines)—not pre-written responses.

## Trust choices for ₹4Cr+ decisions

- Every cell carries **confidence** and **provenance snippet** from the source file.
- **Quality gate** for awards: ISO + BRCGS + moisture report + audit ≥ 80 (configurable rule shown in UI).
- Low-confidence and unit/currency flags surface **review_recommended** before award math.
- **Exports**: comparison matrix, questionnaire summary, split-award CSV for audit.

## Ugly edges in the dataset

| Vendor | Edge |
|--------|------|
| PackRight | Off-template Excel, INR **per 100 boxes** |
| Global Carton | **USD** PDF + **5% footnote** discount applied in parser |
| Southern Board | Word prose, **27/30 lines**, lines 28–30 omitted |
| DesiPack | Angled **rate card** (SVG), audit 72 → **fails gate** |
| QuickPack | Email **₹/kg** + “same as last year” baseline references |

## LLM / OpenAI (why not wired on public build)

- **Parser-first v1** is auditable and deterministic—important for award math and live demos.
- **Public URL + API key** = cost and abuse risk without caps, auth, and rate limits (out of scope for 48h).
- **Designed v2 escalation:** `gpt-4o-mini` for ambiguous prose; `gpt-4o` vision for true scans—only when parser confidence is below threshold, with human confirm before award.
- Co-pilot conversation in the demo is **scripted** to show UX; production would call an LLM with RFx templates and policy guardrails.

## Deliberately left out

- Production OCR for camera photos (SVG simulates scan; v2 vision model + human confirm).
- Vendor portal and real SMTP threading.
- Multi-tenant auth, ERP posting, legal award workflow signatures.
- Full 30-row split table in UI (analyst + CSV export carry full math).

## If the deeper problem is elsewhere

The hardest long-term problem is not parsing—it is **maintaining a canonical RFx line model as vendors reinterpret specs**. Next investment: interactive line matching UI + learning from buyer corrections, then agentic re-negotiation on gaps.
