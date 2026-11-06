# Recorded walkthrough (~7 min)

## Before recording
- `.env.local` has `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`); `npm run dev`; open the app; click **Reset**.
- Do one complete dry run first. Re-reading a file you have read before is served from a local cache, so the recording is fast and repeatable (the first read of each file is a real model call).
- Keep the browser at ~1440 px wide.

## Script
1. **0:00 Hook.** "Five vendors, nine days, five formats. The buyer retypes it all, then the VP asks a question and there goes day four."
2. **0:30 Co-pilot.** Click *Use a starter prompt* and send. Watch the draft fill on the right (lines from the item master, gate, terms). Open *tool calls*: "the draft is whatever the tools set, not prose."
3. **1:30 Send.** Show the model-written cover email: "reply in any format". SMTP is stubbed.
4. **2:00 Read replies.** *Read all replies.* Open the photo and the one-line email next to their results. Point at the warnings (27/30, image not machine-verifiable).
5. **3:00 Compare.** Click a PackRight "per 1000" cell, a Global USD cell, a QuickPack cell (interpretation: "applied to all 5-ply lines"), Southern L05 (spec deviation). Click **Confirm all** for QuickPack to show the buyer-in-the-loop. Open *Questionnaire & documents*: Southern's expired ISO certificate.
6. **4:30 Ask.** In this order:
   - "What if we split it: cheapest per line, but only among vendors who cleared the quality questionnaire?"
   - "How much of that rests on numbers I haven't confirmed?"
   - "Rank the vendors fairly." (like-for-like, not raw totals)
   - **One question you did not plan.** For example: "If Global's discount isn't earned and freight adds 6%, does the split still beat PackRight alone?" Show it answers or says what it cannot.
7. **6:30 Trust.** Click *Score vs ground truth*. "Accuracy, and the number that matters: wrong and not flagged."
8. **7:00 Close.** DECISIONS.md: what's real, what's stubbed, and the better problem.
