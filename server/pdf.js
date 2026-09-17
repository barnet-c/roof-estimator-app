// Formal estimate PDF, laid out like a real contractor's estimate: company
// letterhead, estimate number/date/validity, customer + project summary,
// roof assessment, itemized scope-of-work table with totals, before/after
// visualization, notes, terms and signature lines.
//
// All text placed in the PDF is either a validated enum, a number we format
// ourselves, or user text passed through sanitizeText/sanitizeMultiline.

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { sanitizeText, sanitizeMultiline } from "./security.js";
import { buildOverview, roofTypeInfo, actionInfo, expectedLifeAfter } from "./narrative.js";

const ORANGE = "#e8630a";
const INK = "#1f1a16";
const MUTED = "#6b625b";
const RULE = "#d9d2ca";
const LIGHT = "#faf6f2";

const PAGE_W = 612;
const LEFT = 54;
const RIGHT = 558;
const CONTENT_W = RIGHT - LEFT;

export const DEFAULT_TERMS =
  "This estimate is based on photo analysis and is valid for the period shown above. " +
  "Final pricing is confirmed after an on-site inspection. Any additional work required due to " +
  "concealed conditions (for example deteriorated decking or wet insulation) will be quoted " +
  "separately and approved in writing before proceeding. Payment terms: 50% deposit upon " +
  "acceptance, balance due on completion. All work is performed by licensed and insured crews " +
  "and includes cleanup and debris removal.";

export function money(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function itemsTotal(items) {
  return (items || []).reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );
}

// Fallback line items for records created before itemized estimates existed.
export function defaultLineItems(rec) {
  const sqft = Number(rec.square_footage) || 0;
  const mid = ((Number(rec.price_band_low) || 0) + (Number(rec.price_band_high) || 0)) / 2;
  const rate = sqft > 0 ? Math.round((mid / sqft) * 100) / 100 : 0;
  const action = rec.recommended_action || "repair";
  const roof = rec.roof_type && rec.roof_type !== "unknown" ? `${rec.roof_type} ` : "";
  return [
    {
      description: `Commercial roof ${action} - ${roof}roof system, labor and materials`,
      quantity: sqft,
      unit: "sq ft",
      unit_price: rate,
    },
  ];
}

export function estimateNumberFor(rec) {
  const d = new Date(rec.created_date || Date.now());
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `EST-${ymd}-${String(rec.id || "").slice(0, 4).toUpperCase()}`;
}

function longDate(iso) {
  return new Date(iso || Date.now()).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function cap(s) {
  s = String(s || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Resolve an /uploads/... URL to a PNG/JPEG file on disk (pdfkit cannot embed
// webp/svg). basename() prevents any path traversal.
function imagePathFor(url, uploadDir) {
  if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const name = path.basename(url);
  if (!/\.(png|jpe?g)$/i.test(name)) return null;
  const p = path.join(uploadDir, name);
  return fs.existsSync(p) ? p : null;
}

export function buildEstimatePdf({ record, company, settings, uploadDir }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 64, left: LEFT, right: LEFT },
      bufferPages: true,
      info: {
        Title: `Estimate ${record.estimate_number || estimateNumberFor(record)}`,
        Author: sanitizeText(company?.company_name || record.company_name, 80),
        Subject: "Commercial roofing estimate",
      },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      render(doc, { record, company, settings, uploadDir });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function render(doc, { record, company, settings, uploadDir }) {
  const companyName = sanitizeText(company?.company_name || record.company_name, 80) || "Roofing Company";
  const companyEmail = company?.email || "";
  const companyDesc = sanitizeMultiline(company?.description || "", 160).replace(/\n+/g, " ");
  const estimateNo = record.estimate_number || estimateNumberFor(record);
  const validDays = Math.max(1, Math.min(365, Number(record.valid_days) || 30));
  const issued = new Date(record.created_date || Date.now());
  const validUntil = new Date(issued.getTime() + validDays * 86400000);
  const items = Array.isArray(record.line_items) && record.line_items.length
    ? record.line_items
    : defaultLineItems(record);
  const total = itemsTotal(items);

  const bottomY = () => doc.page.height - doc.page.margins.bottom;
  const ensureSpace = (h) => {
    if (doc.y + h > bottomY()) doc.addPage();
  };
  const rule = (y, color = RULE, w = 0.75) => {
    doc.save().moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(w).strokeColor(color).stroke().restore();
  };
  const sectionTitle = (title, keepWith = 42) => {
    // The header itself needs ~52px; keep it together with at least `keepWith`
    // px of the first content so a title never lands alone at the foot of a
    // page with its body pushed onto the next one.
    ensureSpace(52 + keepWith);
    doc.moveDown(0.9);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ORANGE).text(title.toUpperCase(), LEFT, doc.y, {
      characterSpacing: 0.8,
    });
    rule(doc.y + 3, ORANGE, 1);
    doc.y += 12;
  };
  const kvRows = (x, y, w, rows) => {
    let yy = y;
    for (const [label, value] of rows) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(label, x, yy, { width: 105, lineBreak: false });
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(String(value ?? "-"), x + 110, yy - 1, { width: w - 110 });
      yy = Math.max(yy + 15, doc.y + 2);
    }
    return yy;
  };

  // --- Letterhead -----------------------------------------------------------
  doc.save().rect(0, 0, PAGE_W, 7).fill(ORANGE).restore();

  doc.font("Helvetica-Bold").fontSize(21).fillColor(INK).text(companyName, LEFT, 42, { width: 300 });
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
  if (companyEmail) doc.text(companyEmail, { width: 300 });
  if (companyDesc) doc.text(companyDesc, { width: 300 });
  const leftBottom = doc.y;

  doc.font("Helvetica-Bold").fontSize(26).fillColor(ORANGE).text("ESTIMATE", 340, 40, { width: 218, align: "right" });
  let my = 76;
  for (const [label, value] of [
    ["Estimate #", estimateNo],
    ["Date issued", longDate(issued)],
    ["Valid until", longDate(validUntil)],
  ]) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(label, 340, my, { width: 110, align: "right", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(value, 452, my - 1, { width: 106, align: "right", lineBreak: false });
    my += 15;
  }

  doc.y = Math.max(leftBottom, my) + 14;
  rule(doc.y);
  doc.y += 16;

  // --- Prepared for / Project summary ---------------------------------------
  const colW = (CONTENT_W - 24) / 2;
  const topY = doc.y;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ORANGE).text("PREPARED FOR", LEFT, topY, { characterSpacing: 0.8 });
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ORANGE).text("PROJECT SUMMARY", LEFT + colW + 24, topY, { characterSpacing: 0.8 });

  const sqft = Number(record.square_footage) || 0;
  const leftEnd = kvRows(LEFT, topY + 16, colW, [
    ["Customer email", record.email || "-"],
    ["Property ZIP", record.zip_code || "-"],
    ["Roof area", sqft ? `${sqft.toLocaleString("en-US")} sq ft` : "-"],
  ]);
  const afterLife =
    record.expected_life_years != null
      ? record.expected_life_years
      : expectedLifeAfter(record.recommended_action, record.roof_type, record.estimated_life_years);
  const rightEnd = kvRows(LEFT + colW + 24, topY + 16, colW, [
    ["Roof type", roofTypeInfo(record.roof_type).name],
    ["Recommended", actionInfo(record.recommended_action).title],
    ["Condition", cap(record.damage_severity || "-")],
    ["Current roof life", record.estimated_life_years != null ? `~${record.estimated_life_years} yrs remaining` : "-"],
    ["Life after service", `~${afterLife} yrs`],
  ]);
  doc.y = Math.max(leftEnd, rightEnd) + 4;

  // --- Assessment & recommended solution ------------------------------------
  sectionTitle("Assessment & recommended solution");
  const overview = buildOverview(record);
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  overview.split("\n\n").forEach((para, i) => {
    if (i > 0) doc.moveDown(0.5);
    ensureSpace(44);
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(para, LEFT, doc.y, {
      width: CONTENT_W,
      lineGap: 2,
    });
  });
  if (record.confidence) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(
      `Assessment confidence: ${record.confidence}. All findings are confirmed during the on-site inspection.`,
      LEFT,
      doc.y,
      { width: CONTENT_W },
    );
  }

  // --- Scope of work & pricing ---------------------------------------------
  sectionTitle("Scope of work & pricing");
  const col = {
    desc: { x: LEFT + 8, w: 236 },
    qty: { x: 300, w: 56 },
    unit: { x: 362, w: 48 },
    price: { x: 416, w: 66 },
    amt: { x: 488, w: 62 },
  };
  const drawTableHeader = () => {
    const y = doc.y;
    doc.save().rect(LEFT, y, CONTENT_W, 20).fill(LIGHT).restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    const ty = y + 6;
    doc.text("DESCRIPTION", col.desc.x, ty, { width: col.desc.w, lineBreak: false });
    doc.text("QTY", col.qty.x, ty, { width: col.qty.w, align: "right", lineBreak: false });
    doc.text("UNIT", col.unit.x, ty, { width: col.unit.w, lineBreak: false });
    doc.text("UNIT PRICE", col.price.x, ty, { width: col.price.w, align: "right", lineBreak: false });
    doc.text("AMOUNT", col.amt.x, ty, { width: col.amt.w, align: "right", lineBreak: false });
    doc.y = y + 20;
  };
  ensureSpace(60);
  drawTableHeader();

  for (const it of items) {
    const desc = sanitizeText(it.description, 120) || "Roofing work";
    const qty = Number(it.quantity) || 0;
    const unit = sanitizeText(it.unit || "", 16);
    const price = Number(it.unit_price) || 0;
    const amount = qty * price;

    doc.font("Helvetica").fontSize(9.5);
    const h = Math.max(20, doc.heightOfString(desc, { width: col.desc.w }) + 10);
    if (doc.y + h > bottomY()) {
      doc.addPage();
      drawTableHeader();
    }
    const y = doc.y;
    const ty = y + 5;
    doc.fillColor(INK).text(desc, col.desc.x, ty, { width: col.desc.w });
    doc.text(qty ? qty.toLocaleString("en-US") : "-", col.qty.x, ty, { width: col.qty.w, align: "right", lineBreak: false });
    doc.text(unit || "", col.unit.x, ty, { width: col.unit.w, lineBreak: false });
    doc.text(money(price), col.price.x, ty, { width: col.price.w, align: "right", lineBreak: false });
    doc.text(money(amount), col.amt.x, ty, { width: col.amt.w, align: "right", lineBreak: false });
    doc.y = y + h;
    rule(doc.y, RULE, 0.5);
  }

  // Totals
  ensureSpace(70);
  doc.y += 8;
  const totalsX = 360;
  const totalsW = RIGHT - totalsX;
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text("Subtotal", totalsX, doc.y, { width: 100, lineBreak: false });
  doc.fillColor(INK).text(money(total), totalsX + 100, doc.y, { width: totalsW - 100, align: "right" });
  doc.y += 4;
  const ty2 = doc.y;
  doc.save().rect(totalsX, ty2, totalsW, 26).fill(LIGHT).restore();
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text("Estimated total", totalsX + 8, ty2 + 7, { width: 110, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(ORANGE).text(money(total), totalsX + 100, ty2 + 6, { width: totalsW - 108, align: "right" });
  doc.y = ty2 + 34;

  const low = Number(record.price_band_low) || 0;
  const high = Number(record.price_band_high) || 0;
  if (low || high) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(
      `Photo-analysis price range for this scope: ${money(low)} to ${money(high)}. Final pricing is confirmed after inspection.`,
      LEFT,
      doc.y,
      { width: CONTENT_W },
    );
  }

  // --- Before / after (starts on its own page) ------------------------------
  const beforePath = imagePathFor(record.photo_urls?.[0], uploadDir);
  const afterPath = imagePathFor(record.after_image_url, uploadDir);
  if (beforePath || afterPath) {
    doc.addPage();
    sectionTitle("Before & after visualization");
    const boxW = (CONTENT_W - 16) / 2;
    const boxH = Math.round(boxW * (2 / 3));
    ensureSpace(boxH + 40);
    const y = doc.y;
    const panels = [
      { label: "Current condition", p: beforePath, x: LEFT },
      { label: "Projected result (AI visualization)", p: afterPath, x: LEFT + boxW + 16 },
    ];
    for (const panel of panels) {
      doc.save().rect(panel.x, y, boxW, boxH).lineWidth(0.75).strokeColor(RULE).stroke().restore();
      if (panel.p) {
        try {
          doc.image(panel.p, panel.x + 1, y + 1, { fit: [boxW - 2, boxH - 2], align: "center", valign: "center" });
        } catch {
          doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Image unavailable", panel.x, y + boxH / 2 - 5, { width: boxW, align: "center" });
        }
      } else {
        doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Not available", panel.x, y + boxH / 2 - 5, { width: boxW, align: "center" });
      }
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(panel.label, panel.x, y + boxH + 6, { width: boxW, align: "center", lineBreak: false });
    }
    doc.y = y + boxH + 22;
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text(
      "The projected result is an AI-generated visualization derived from the customer's photo. Actual results may vary.",
      LEFT,
      doc.y,
      { width: CONTENT_W, align: "center" },
    );
  }

  // --- Notes ----------------------------------------------------------------
  const notes = sanitizeMultiline(record.notes || "", 2000);
  if (notes) {
    sectionTitle("Notes");
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(notes, LEFT, doc.y, { width: CONTENT_W, lineGap: 2 });
  }

  // --- Terms ----------------------------------------------------------------
  sectionTitle("Terms & conditions");
  const terms = sanitizeMultiline(record.terms || "", 2000) || DEFAULT_TERMS;
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(terms, LEFT, doc.y, { width: CONTENT_W, lineGap: 2 });

  const booking = String(settings?.booking_link || "").trim();
  if (booking) {
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Schedule your free on-site inspection: ", LEFT, doc.y, { continued: true });
    doc.fillColor(ORANGE).text(booking, { link: booking, underline: true });
  }

  // --- Signatures -----------------------------------------------------------
  ensureSpace(96);
  doc.y += 30;
  const sigY = doc.y + 26;
  const sigW = (CONTENT_W - 32) / 2;
  for (const [i, label] of [[0, `Authorized by ${companyName}`], [1, "Accepted by customer"]]) {
    const x = LEFT + i * (sigW + 32);
    doc.save().moveTo(x, sigY).lineTo(x + sigW - 90, sigY).lineWidth(0.75).strokeColor(INK).stroke().restore();
    doc.save().moveTo(x + sigW - 80, sigY).lineTo(x + sigW, sigY).lineWidth(0.75).strokeColor(INK).stroke().restore();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(label, x, sigY + 4, { width: sigW - 90, lineBreak: false });
    doc.text("Date", x + sigW - 80, sigY + 4, { width: 80, lineBreak: false });
  }
  doc.y = sigY + 20;

  // --- Footer on every page -------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // allow writing inside the bottom margin
    rule(doc.page.height - 44, RULE, 0.5);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(
      `${companyName}  |  Estimate ${estimateNo}  |  Page ${i - range.start + 1} of ${range.count}`,
      LEFT,
      doc.page.height - 36,
      { width: CONTENT_W, align: "center", lineBreak: false },
    );
    doc.page.margins.bottom = savedBottom;
  }
}
