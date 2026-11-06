// Generates the fabricated vendor replies AND the ground truth they were generated from.
// The ground truth is what lets the app score its own extraction (see /api/eval).
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/samples/vendors");
const dataDir = path.join(__dirname, "../src/data");
fs.mkdirSync(outDir, { recursive: true });

const lines = JSON.parse(fs.readFileSync(path.join(dataDir, "rfx-lines.json"), "utf8"));
const FX = 88; // USD→INR used by the buyer in the demo (editable in the app)

// Deterministic noise so the dataset is stable but no vendor wins every line.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const factor = (seed, mean, spread) => {
  const r = rng(seed);
  return lines.map(() => mean + (r() - 0.5) * 2 * spread);
};
const shortName = (d) => {
  const base = d.split(",")[0].toUpperCase().replace(/(\d)-PLY/, "$1 PLY");
  if (base.length <= 40) return base;
  const cut = base.slice(0, 40);
  return cut.slice(0, cut.lastIndexOf(" "));
};
const r2 = (n) => Math.round(n * 100) / 100;
const truth = { fxUsdInr: FX, vendors: {} };

// ───────── 1. PackRight — off-template Excel, per-100 with per-1000 overrides ─────────
{
  const f = factor(11, 0.97, 0.05);
  const unitFor = (i) => (["L10", "L24", "L26"].includes(lines[i].lineId) ? 1000 : 100);
  const vendorName = (l) => l.description.split(",")[0].replace(/(\d)-ply/i, "$1 PLY").toUpperCase();
  const rows = [
    ["PackRight Industries Pvt Ltd — Quotation PR-2026-441 (ref your RFx CORR-2026-118)"],
    ["Valid 30 days from date | Payment: 45 days | Delivery: FOR Bangalore DC, freight included | GST 18% extra"],
    [],
    ["S.No", "Our item description", "Rate", "Rate per", "Lead time"],
  ];
  const t = {};
  lines.forEach((l, i) => {
    const unit = unitFor(i);
    const perUnit = r2(l.targetInrPerBox * f[i]);
    const rate = Math.round(perUnit * unit);
    t[l.lineId] = { price: rate / unit, currency: "INR" };
    rows.push([i + 1, vendorName(l), rate, `per ${unit}`, `${12 + (i % 4)} days`]);
  });
  rows.push([], ["Quality questionnaire (PackRight):"], ["ISO 9001 certified", "Yes"], ["BRCGS Packaging Materials", "Yes"], ["Moisture test report", "Yes — available on request"], ["Last third-party audit score", "88"]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Quote");
  XLSX.writeFile(wb, path.join(outDir, "1-packright-quotation.xlsx"));
  truth.vendors.packright = { gate: "cleared", lines: t, missing: [] };
}

// ───────── 2. Global Carton — USD PDF on letterhead, conditional discount in footnote ─────────
{
  const f = factor(23, 0.93, 0.05);
  const t = {};
  const pdfPath = path.join(outDir, "2-global-carton-proposal.pdf");
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    doc.fontSize(18).text("GLOBAL CARTON LLC", { align: "center" });
    doc.fontSize(10).text("1200 Industrial Blvd, Dallas TX 75207 · export@globalcarton.example", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text("Commercial Proposal — Corrugated Programme FY26 (your ref CORR-2026-118)");
    doc.fontSize(9).text("Payment: 30% advance, 70% against bill of lading. Prices FOB Dallas, USD per box. Offer valid 45 days.");
    doc.moveDown(0.5);
    lines.forEach((l, i) => {
      const usd = Math.round((l.targetInrPerBox / FX) * f[i] * 1000) / 1000;
      t[l.lineId] = { price: usd, currency: "USD" };
      doc.fontSize(9).text(`${String(i + 1).padStart(2, "0")}. ${l.sku}  ${l.description.slice(0, 52)}  —  USD ${usd.toFixed(3)} / box`);
    });
    doc.moveDown();
    doc.fontSize(8).fillColor("gray").text(
      "* Prices exclude ocean freight, insurance, import duty and clearance. A volume discount of 5% will be credited on the final invoice for orders above our standard MOQ. Standard terms apply.",
      { align: "justify" }
    );
    doc.fillColor("black").moveDown();
    doc.fontSize(9).text("Supplier questionnaire — ISO 9001: Yes (certificate attached). BRCGS Packaging: Yes. Moisture test report: Yes (attached to our quality pack). Last audit score: 91/100.");
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  truth.vendors.global = { gate: "cleared", lines: t, missing: [] };
}

function certPdf(file, title, lines2) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60 });
    const stream = fs.createWriteStream(path.join(outDir, file));
    doc.pipe(stream);
    doc.fontSize(20).text(title, { align: "center" });
    doc.moveDown();
    lines2.forEach((x) => doc.fontSize(11).text(x).moveDown(0.3));
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
await certPdf("2b-global-iso9001-certificate.pdf", "Certificate of Registration — ISO 9001:2015", [
  "This is to certify that the Quality Management System of GLOBAL CARTON LLC, Dallas TX,",
  "conforms to ISO 9001:2015 for the design and manufacture of corrugated packaging.",
  "Certificate no. QMS-77120 · Issued 2024-08-15 · Valid until 2027-08-14",
  "Certification body: Apex Assurance",
]);
await certPdf("3b-southern-iso9001-certificate.pdf", "Certificate of Registration — ISO 9001:2015", [
  "This is to certify that the Quality Management System of SOUTHERN BOARD MILLS PVT LTD, Coimbatore,",
  "conforms to ISO 9001:2015 for the manufacture of corrugated board and cartons.",
  "Certificate no. IN-QMS-40215 · Issued 2023-04-01 · Valid until 2026-03-31",
  "Certification body: Bharat Quality Registrar",
]);
await certPdf("5b-quickpack-moisture-test-report.pdf", "Moisture Content Test Report", [
  "Client: QuickPack Industries · Material: 5-ply & 3-ply corrugated board, kraft liner",
  "Method: oven-dry (IS 1060) · Samples tested: 12 · Result: 7.6% mean moisture (limit 9%)",
  "Test date: 2026-10-20 · Lab: Southern Packaging Test Laboratory",
]);

// ───────── 3. Southern Board — Word prose, 27/30 lines, a spec deviation, expired ISO ─────────
{
  const f = factor(37, 1.03, 0.04);
  const t = {};
  const rowsT = [new TableRow({ children: [new TableCell({ children: [new Paragraph("Item")] }), new TableCell({ children: [new Paragraph("Commercial (INR per box)")] })] })];
  lines.slice(0, 27).forEach((l, i) => {
    let price = r2(l.targetInrPerBox * f[i]);
    let label = `${l.sku}: ${l.description}`;
    if (l.lineId === "L05") {
      // Spec deviation: cheaper because it is a different (5-ply) construction.
      price = r2(l.targetInrPerBox * 0.78);
      label = `${l.sku}: 5-ply heavy-duty export crate insert 1200x800mm (our standard heavy-duty construction)`;
    }
    t[l.lineId] = { price, currency: "INR" };
    rowsT.push(new TableRow({ children: [new TableCell({ children: [new Paragraph(label)] }), new TableCell({ children: [new Paragraph(`Rs. ${price.toFixed(2)}`)] })] }));
  });
  const para = (text, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
  const doc = new Document({
    sections: [{
      children: [
        para("Southern Board Mills Pvt Ltd, Coimbatore", true),
        para("Thank you for the opportunity to quote against RFx CORR-2026-118. Our offer is set out below. Prices are per box, ex-works Coimbatore; freight extra to your Bangalore DC at actuals. Payment 60 days from invoice. GST as applicable. Validity 30 days."),
        para("For item 5 (7-ply heavy-duty export crate insert) we propose our standard 5-ply heavy-duty construction, which has performed well in comparable export applications; kindly confirm acceptability."),
        para("Commercial summary:", true),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rowsT }),
        para("Items 28, 29 and 30 are under review pending flute availability; we will confirm within 48 hours."),
        para("Quality: we are ISO 9001 certified (certificate attached), BRCGS Packaging Materials certified, and can share our moisture test report. Our last audit score was 84."),
      ],
    }],
  });
  fs.writeFileSync(path.join(outDir, "3-southern-board-offer.docx"), await Packer.toBuffer(doc));
  truth.vendors.southern = { gate: "conflict", lines: t, missing: ["L28", "L29", "L30"] };
}

// ───────── 4. DesiPack — photo of a printed rate card (28 lines, skewed) ─────────
{
  const f = factor(53, 0.9, 0.04);
  const t = {};
  const rows = [];
  lines.slice(0, 28).forEach((l, i) => {
    const price = r2(l.targetInrPerBox * f[i]);
    t[l.lineId] = { price, currency: "INR" };
    rows.push({ name: shortName(l.description), price: price.toFixed(2) });
  });
  fs.writeFileSync(path.join(__dirname, "_ratecard.json"), JSON.stringify({ rows, out: path.join(outDir, "4-desipack-ratecard-photo.jpg") }));
  try {
    execFileSync("python3", [path.join(__dirname, "make-ratecard-photo.py"), path.join(__dirname, "_ratecard.json")], { stdio: "inherit" });
  } catch (e) {
    console.warn("Could not render the rate-card photo (needs python3 + Pillow). Existing file, if any, is kept.", e.message);
  }
  fs.rmSync(path.join(__dirname, "_ratecard.json"), { force: true });
  truth.vendors.desipack = { gate: "failed", lines: t, missing: ["L29", "L30"] };
}

// ───────── 5. QuickPack — the brief's one-line email, nothing more ─────────
{
  const t = {};
  for (const l of lines) {
    if (l.plies === 5) t[l.lineId] = { price: 42 * l.weightKg, currency: "INR" };
    else if (l.plies === 3) t[l.lineId] = { price: 38 * l.weightKg, currency: "INR" };
    else t[l.lineId] = { price: l.lastPaidInr, currency: "INR" }; // "rest same as last year"
  }
  const email = `From: Vikram Rao <sales@quickpack.example>
To: procurement@buyer.example
Subject: RE: RFx CORR-2026-118 — corrugated packaging

Hi team,

₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra.

Valid till month end, payment 30 days, GST 18% extra as usual.

On quality: ISO 9001 we have. BRCGS not yet, audit planned for Q1. Moisture test report attached. Last audit came in at 79.

Regards,
Vikram Rao
QuickPack Industries
`;
  fs.writeFileSync(path.join(outDir, "5-quickpack-email.txt"), email);
  truth.vendors.quickpack = { gate: "failed", lines: t, missing: [] };
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    [
      { id: "packright", name: "PackRight Industries", received: "Day 2", subject: "Quotation PR-2026-441", note: "Excel that ignores the template", files: [{ file: "1-packright-quotation.xlsx", role: "response" }] },
      { id: "global", name: "Global Carton LLC", received: "Day 4", subject: "Commercial Proposal FY26", note: "PDF on letterhead, USD, discount in a footnote", files: [{ file: "2-global-carton-proposal.pdf", role: "response" }, { file: "2b-global-iso9001-certificate.pdf", role: "attachment" }] },
      { id: "southern", name: "Southern Board Mills", received: "Day 6", subject: "Our offer — CORR-2026-118", note: "Word doc, commercials in a table and a paragraph", files: [{ file: "3-southern-board-offer.docx", role: "response" }, { file: "3b-southern-iso9001-certificate.pdf", role: "attachment" }] },
      { id: "desipack", name: "DesiPack Co", received: "Day 8", subject: "Rate card (photo)", note: "Phone photo of a printed rate card, taken at an angle", files: [{ file: "4-desipack-ratecard-photo.jpg", role: "response" }] },
      { id: "quickpack", name: "QuickPack", received: "Day 9", subject: "RE: RFx CORR-2026-118", note: "One email: “₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra.”", files: [{ file: "5-quickpack-email.txt", role: "response" }, { file: "5b-quickpack-moisture-test-report.pdf", role: "attachment" }] },
    ],
    null,
    2
  )
);
fs.writeFileSync(path.join(dataDir, "ground-truth.json"), JSON.stringify(truth, null, 2));
console.log("Generated vendor samples + ground truth.");
