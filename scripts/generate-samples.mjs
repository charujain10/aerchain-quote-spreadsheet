import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/samples/vendors");
fs.mkdirSync(outDir, { recursive: true });

const lines = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/data/rfx-lines.json"), "utf8")
);

const wb = XLSX.utils.book_new();
const rows = [
  ["PackRight Industries — Quotation Ref PR-2026-441"],
  ["Valid 30 days | Payment: 45 days | Freight: FOR Bangalore"],
  [],
  ["S.No", "Our Item Description", "Rate (INR per 100 boxes)", "Lead time"],
];
lines.forEach((l, i) => {
  const rate100 = Math.round(l.targetInrPerBox * 100 * (0.92 + (i % 5) * 0.01));
  rows.push([i + 1, l.description, rate100, `${12 + (i % 4)} days`]);
});
rows.push([]);
rows.push(["Quality questionnaire (PackRight):"]);
rows.push(["ISO 9001", "Yes"]);
rows.push(["BRCGS food-grade liner", "Yes"]);
rows.push(["Moisture test report attached", "Yes"]);
rows.push(["Last audit score", "88"]);
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "Quote");
XLSX.writeFile(wb, path.join(outDir, "1-packright-off-template.xlsx"));

const pdfPath = path.join(outDir, "2-global-carton-letterhead.pdf");
await new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  doc.fontSize(18).text("GLOBAL CARTON LLC", { align: "center" });
  doc.fontSize(10).text("1200 Industrial Blvd, Dallas TX", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text("Commercial Proposal — Corrugated Program FY26");
  doc.moveDown(0.5);
  lines.forEach((l, i) => {
    const usd = (l.targetInrPerBox / 83.5) * (0.95 + (i % 3) * 0.008);
    doc
      .fontSize(9)
      .text(
        `${String(i + 1).padStart(2, "0")}. ${l.sku} — ${l.description.substring(0, 55)}… — USD ${usd.toFixed(3)}/box`
      );
  });
  doc.moveDown();
  doc
    .fontSize(8)
    .fillColor("gray")
    .text(
      "* All prices FOB Dallas. Standard terms apply. Volume discount of 5% will be applied on final invoice for orders above MOQ.",
      { align: "justify" }
    );
  doc.fillColor("black");
  doc.moveDown();
  doc.fontSize(9).text("Supplier questionnaire: ISO 9001 Yes | BRCGS Yes | Moisture report Yes | Audit score 91");
  doc.end();
  stream.on("finish", resolve);
  stream.on("error", reject);
});

const tableRows = [
  new TableRow({
    children: [
      new TableCell({ children: [new Paragraph("Line")] }),
      new TableCell({ children: [new Paragraph("Commercial (INR/box)")] }),
    ],
  }),
];
lines.slice(0, 27).forEach((l, i) => {
  const price = Math.round(l.targetInrPerBox * (1.04 + (i % 7) * 0.005));
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(`${l.sku}: ${l.description}`)] }),
        new TableCell({ children: [new Paragraph(`Rs. ${price}`)] }),
      ],
    })
  );
});
const wordDoc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          children: [new TextRun({ text: "Southern Board Mills Pvt Ltd", bold: true, size: 28 })],
        }),
        new Paragraph({
          children: [
            new TextRun(
              "Thank you for your RFx. We are pleased to offer the following. Freight extra to your Bangalore DC as discussed."
            ),
          ],
        }),
        new Paragraph({ children: [new TextRun("Commercial summary:")] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
        new Paragraph({
          children: [
            new TextRun(
              "Note: Lines 28–30 under review pending flute availability; we will confirm within 48 hours."
            ),
          ],
        }),
        new Paragraph({
          children: [new TextRun("Quality: ISO certified, BRCGS yes, moisture report shared, audit score 84.")],
        }),
      ],
    },
  ],
});
const wordBuf = await Packer.toBuffer(wordDoc);
fs.writeFileSync(path.join(outDir, "3-southern-board-prose.docx"), wordBuf);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
  <rect width="100%" height="100%" fill="#f4f0e8"/>
  <g transform="rotate(-4 450 600)">
  <text x="40" y="60" font-family="monospace" font-size="28" fill="#222">DESIPACK CO — RATE CARD</text>
  <text x="40" y="100" font-size="18" fill="#444">Photocopy — Nov 2026</text>
  ${lines
    .slice(0, 28)
    .map((l, i) => {
      const p = Math.round(l.targetInrPerBox * 0.89);
      return `<text x="40" y="${140 + i * 38}" font-size="16" fill="#111">${l.sku} ${p}/box</text>`;
    })
    .join("\n")}
  <text x="40" y="1180" font-size="14" fill="#666">Audit score 72 — moisture report pending</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(outDir, "4-desipack-rate-card.svg"), svg);

const emailLines = lines.map((l, i) => {
  if (i === 0) return `${l.sku}: ₹${42}/kg for 5-ply beverage master (convert to box at 0.95 kg)`;
  if (i === 1) return `${l.sku}: ₹${38}/kg for 3-ply e-com shipper (0.42 kg/box)`;
  if (i < 10) return `${l.sku}: same as last year (see baseline)`;
  return `${l.sku}: ₹${Math.round(l.targetInrPerBox * (0.97 + (i % 4) * 0.01))}/box`;
});
const email = `From: quotes@quickpack.in
Subject: RE: RFx CORR-2026-118 — corrugated

Hi team,

₹42/kg for the 5-ply, ₹38 for the 3-ply, rest same as last year, freight extra.

Detail:
${emailLines.join("\n")}

Quality: ISO yes, BRCGS no, moisture yes, audit 79.

Regards,
QuickPack
`;
fs.writeFileSync(path.join(outDir, "5-quickpack-email.txt"), email);

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    [
      { id: "packright", file: "1-packright-off-template.xlsx", name: "PackRight Industries", currency: "INR" },
      { id: "global", file: "2-global-carton-letterhead.pdf", name: "Global Carton LLC", currency: "USD" },
      { id: "southern", file: "3-southern-board-prose.docx", name: "Southern Board Mills", currency: "INR" },
      { id: "desipack", file: "4-desipack-rate-card.svg", name: "DesiPack Co", currency: "INR" },
      { id: "quickpack", file: "5-quickpack-email.txt", name: "QuickPack", currency: "INR" },
    ],
    null,
    2
  )
);

console.log("Generated vendor samples in", outDir);
