# What I decided, and what I left out (one page)

**Category:** corrugated packaging, RFx `CORR-2026-118`, 30 lines, 5 vendors, ₹1.34 Cr/yr at target. It is a category where the unit traps are real (per box, per 100, per 1000, per kg) and a wrong unit is a seven-figure error.

## The bet
The model reads each vendor reply **as it arrived**: spreadsheet cells, the PDF, Word text, the photo itself, the email body. There are no per-format parsers and no template. Three rules keep that safe:

1. **The model extracts, code computes.** It reports each price as written, with its unit and currency, plus a verbatim quote. Unit conversion, FX, discounts and every total are deterministic code. A model never does arithmetic that ends up in front of the buyer.
2. **The analyst is a tool-calling agent over that table**, not a text generator. Tables and charts are rendered from tool results, not retyped. A checker scans the prose and flags any figure that is not in a tool result.
3. **Uncertainty is a state, not a colour.** Every cell is *Looks right / Check me / Buyer confirmed / Not quoted*. Award answers say how many rupees rest on unconfirmed cells.

## Ugly edges and what the system does
| Vendor | Edge | Behaviour |
|---|---|---|
| PackRight | Ignores the template; "per 100" with three rows overriding to "per 1000" | Reads the per-row unit; converts in code; flags the conversion |
| Global Carton | USD, FOB Dallas, discount in a footnote | Converts at the buyer's editable rate; conditional 5% **not applied**, shown as a scenario; "freight/duty not included" caveat on any award using it |
| Southern Board | 27/30 lines; offers 5-ply for a 7-ply line; **ISO certificate attached has expired** though they answer "yes" | Missing lines shown as gaps; spec deviation flagged; quality gate = *conflict*, not cleared |
| DesiPack | Skewed phone photo, 28 lines | Vision read, every cell "Check me", evidence marked unverifiable by machine |
| QuickPack | The one-line email: "₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra" | Scope expanded to matching lines and labelled as interpretation; ₹/kg × RFx nominal weight; "last year" = the buyer's own PO history, never invented; one click confirms the interpretation for the vendor |

## Judgment calls
- **Like-for-like ranking only.** Raw totals reward a vendor who skipped lines.
- **Claims are not evidence.** A certificate that contradicts an answer beats the answer.
- **Confidence can only go down** after the model reports it (caps for inferred scope, baselines, price outliers vs last-paid, unmatched evidence).
- **Proof, not a badge.** The dataset is fabricated, so truth is known. "Score vs ground truth" reports accuracy and, more importantly, errors that were **not** flagged.

## Left out, on purpose
Real SMTP/inbox threading (stubbed), vendor portal, multi-user auth, ERP posting, landed-cost modelling for imports (surfaced as a caveat, not guessed), OCR-grade bounding-box highlights on source documents, learning from buyer corrections.

## The better problem
Reading the quotes is the solvable part. The expensive failures are quotes that **aren't comparable**: freight extra, FOB vs delivered, conditional discounts, spec substitutions, expired certificates. Next I would have the agent email the vendor to close each gap ("lines 28–30?", "freight amount?") instead of only flagging it to the buyer.
