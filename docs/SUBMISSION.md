# Submission checklist

Aerchain asked for: a working prototype for a live demo, a recorded walkthrough of the analyst conversation, and a one-page note. Send:

1. **Live build** (hosted URL, or run locally and screen-share) — set `GEMINI_API_KEY` on the host; cap spend and put it behind a password if public.
2. **Recorded walkthrough** — follow `docs/WALKTHROUGH.md`.
3. **One-page note** — `docs/DECISIONS.md`.
4. Optional: repo link.

## Before you send
- [ ] Fresh clone: `npm install`, add `.env.local`, `npm run dev` works.
- [ ] Full dry run: co-pilot → read all five replies → compare → three analyst questions → *Score vs ground truth*.
- [ ] Read the "Score vs ground truth" panel: if any error is **wrong and not flagged**, fix or disclose it in the note.
- [ ] Record the video with one unscripted question.

## Reply email (edit)
**Subject:** Aerchain PM Assignment — Charu Jain — Kill the Quote Spreadsheet

Hi [name],

My submission for *Kill the Quote Spreadsheet*:
1. Live build: [url]
2. Walkthrough (analyst conversation): [loom/drive link]
3. One-page note: [link or attached]
Source: [repo link, optional]

The model reads each vendor reply in its original form (spreadsheet, PDF, Word, a phone photo, a one-line email) and extracts it with evidence; unit, currency and totals are deterministic code; the analyst is a tool-calling agent that shows how much of any answer rests on numbers the buyer hasn't confirmed. Happy to drive a live demo whenever suits.

Best,
Charu Jain
