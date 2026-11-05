# How to submit to Aerchain (reply to their email)

Aerchain asked for **four things** (live link appears twice — send it once):

1. **Recorded video** (Loom or Google Drive)  
2. **Live link** to your build  
3. **Document / PPT** detailing what you built  
4. **Link where build is hosted** (= same as #2)

They did **not** require a GitHub link in the email—but **include repo** if you have one; it helps review.

---

## If you demo **live on a call** *and* send async deliverables

| Channel | What to send |
|---------|----------------|
| **Email reply (before deadline)** | All four deliverables below—**even if** a live call is scheduled. |
| **Live call** | Screen-share the **same hosted URL** (not only localhost). Run the script in `docs/WALKTHROUGH.md`. |
| **Repo** | Optional in email: “Source: https://github.com/…” for engineers who want to dig in. |

**Do not** submit only “we’ll demo live” without video + hosted link—they explicitly asked for **Loom/Drive + live link + document**.

---

## Checklist before you hit Send

- [ ] Deploy app → **HTTPS URL** works (Vercel or Render)  
- [ ] On deployed URL: **Load all 5 demo vendor files** → Compare → Analyst (test once)  
- [ ] Record **5–8 min** Loom using `docs/WALKTHROUGH.md`  
- [ ] Upload video to **Loom** or **Google Drive** (anyone with link can view)  
- [ ] Turn `docs/WHAT_WE_BUILT.md` into **PDF or Google Slides** (9 slides)  
- [ ] Optional: attach `docs/DECISIONS.md` as appendix  

---

## Suggested reply email (copy/edit)

**Subject:** Aerchain PM Assignment — Charu Jain — Kill the Quote Spreadsheet

Dear [Recruiter name],

Please find my submission for the Product take-home assignment (**Kill the Quote Spreadsheet**):

1. **Live build:** https://[your-app].vercel.app  
2. **Walkthrough video:** https://[loom-or-drive-link]  
3. **What I built (document):** https://[drive-pdf-or-slides-link]  
   — or attached PDF  

**Summary:** Corrugated packaging RFx (30 lines, 5 vendors). The app ingests messy vendor files (Excel/PDF/Word/rate card/email), normalizes to a single comparison grid with confidence and provenance, and supports natural-language analysis including split award with a quality questionnaire gate—with CSV exports for audit.

**Source code (optional):** https://github.com/[you]/[repo]

Happy to walk through live on a call. Please let me know if you need anything else.

Best regards,  
Charu Jain  
[Phone optional]

---

## Deploy quick reference

**Vercel:** Import GitHub repo → Deploy → copy `.vercel.app` URL.  
**Render:** Web service → Build `npm install && npm run build` → Start `npm start` → copy `.onrender.com` URL.

After deploy, run through ingest + analyst once; if session resets, click **Load all 5** again before analyst questions (in-memory session on serverless).

---

## What *you* still do (not in repo)

| Deliverable | Owner |
|-------------|--------|
| Loom / Drive **video** | You record |
| **Hosted URL** | You deploy |
| **PPT/PDF** from `WHAT_WE_BUILT.md` | You export |
| Reply **email** | You send |

The codebase covers the **prototype** + **scripts/docs**; it does not replace video or hosting.
