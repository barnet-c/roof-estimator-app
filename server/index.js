import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authMiddleware, requireAuth, issueToken } from "./auth.js";
import {
  isValidEmail,
  decodePhotoDataUrl,
  createRateLimiter,
  sanitizeText,
  sanitizeMultiline,
} from "./security.js";
import { analyzeRoof, ACTIONS } from "./llm.js";
import { generateAfterImage } from "./imagegen.js";
import {
  buildEstimatePdf,
  defaultLineItems,
  estimateNumberFor,
  DEFAULT_TERMS,
} from "./pdf.js";
import {
  buildScope,
  buildOverview,
  expectedLifeAfter,
  roofTypeInfo,
  actionInfo,
} from "./narrative.js";
import {
  DEFAULT_SETTINGS,
  createEstimationRequest,
  updateEstimationRequest,
  getEstimationRequest,
  listEstimationRequests,
  markRequestViewed,
  getSettings,
  saveSettings,
  createAccount,
  getAccountByEmail,
  getAccountById,
  listAccounts,
  updateAccount,
} from "./store.js";
import {
  EMAIL_ENABLED,
  emailStatus,
  buildProspectEmail,
  buildContractorEmail,
  sendEmail,
} from "./email.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Lives OUTSIDE server/ so photo writes never trigger `node --watch` restarts
// (a restart mid-request killed the connection during image generation).
const UPLOAD_DIR = path.join(here, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const app = express();
app.use(express.json({ limit: "30mb" }));
app.use(authMiddleware);

// Serve uploaded photos.
app.use("/uploads", express.static(UPLOAD_DIR));

// Anonymous customers can request estimates — rate limit by client IP.
// Cap is configurable (RATE_LIMIT_MAX); local/dev testing over loopback is
// exempt so repeated local submissions never trip the limiter.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 60;
const rateLimit = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: 60 * 60 * 1000 });

function isLoopback(ip) {
  if (!ip) return false;
  const a = ip.replace(/^::ffff:/, ""); // unwrap IPv4-mapped IPv6
  return a === "127.0.0.1" || a === "::1" || a === "localhost" || a.startsWith("127.");
}

// --- Auth: company/contractor accounts only ---

app.post("/api/auth/signup", (req, res) => {
  const company_name = String(req.body?.company_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const description = String(req.body?.description || "").trim();

  if (!company_name) return res.status(400).json({ error: "Company name is required" });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (getAccountByEmail(email)) {
    return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
  }

  const account = createAccount({ company_name, email, description });
  const user = { id: account.id, email: account.email, company_name: account.company_name, role: "company" };
  res.json({ token: issueToken(user), user });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  const account = getAccountByEmail(email);
  if (!account) {
    return res.status(404).json({ error: "No account found for this email. Create an account first." });
  }
  const user = { id: account.id, email: account.email, company_name: account.company_name, role: "company" };
  res.json({ token: issueToken(user), user });
});

app.get("/api/me", requireAuth, (req, res) => {
  const account = getAccountById(req.user.id);
  res.json({ user: account || req.user });
});

// Parse a free-text ZIP list ("60601, 60602 60603") into unique 5-digit codes.
function parseZips(input) {
  if (Array.isArray(input)) input = input.join(" ");
  return [...new Set(String(input || "").match(/\d{5}/g) || [])];
}

// Public list of companies for the customer dropdown. Only safe fields exposed.
app.get("/api/companies", (_req, res) => {
  const items = listAccounts().map((a) => ({
    id: a.id,
    company_name: sanitizeText(a.company_name, 80),
    service_zips: Array.isArray(a.service_zips) ? a.service_zips : [],
  }));
  res.json({ items });
});

// A company edits its own served ZIP codes.
app.put("/api/account", requireAuth, (req, res) => {
  const account = updateAccount(req.user.id, { service_zips: parseZips(req.body?.service_zips) });
  if (!account) return res.status(404).json({ error: "Account not found" });
  res.json({ user: account });
});

// --- Price band ---

function priceBand(action, sqft, settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const map = {
    repair: [s.repair_low, s.repair_high],
    recoat: [s.recoat_low, s.recoat_high],
    replace: [s.replace_low, s.replace_high],
  };
  const [low, high] = map[action] || map.repair;
  return {
    price_band_low: Math.round(Number(low) * sqft),
    price_band_high: Math.round(Number(high) * sqft),
  };
}

// --- processEstimationRequest (public — customers don't sign in) ---

app.post("/api/processEstimationRequest", async (req, res) => {
  if (!isLoopback(req.ip)) {
    const limit = rateLimit(req.ip || "anon");
    if (!limit.ok) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
  }

  const { company_id, email, square_footage, zip_code, photos } = req.body || {};
  const sqft = Number(square_footage);
  const zip = String(zip_code || "").trim();

  if (!company_id || !email || !square_footage || !zip) {
    return res.status(400).json({ error: "Company, email, square footage and ZIP code are required" });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email address" });
  if (!Number.isFinite(sqft) || sqft <= 0) return res.status(400).json({ error: "Invalid square footage" });
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: "Enter a valid 5-digit ZIP code" });

  // Resolve the chosen company and confirm it serves this ZIP.
  const company = getAccountById(company_id);
  if (!company) return res.status(400).json({ error: "Please choose a company from the list" });
  const serves = Array.isArray(company.service_zips) ? company.service_zips : [];
  if (serves.length > 0 && !serves.includes(zip)) {
    return res.status(400).json({ error: `${company.company_name} does not serve ZIP ${zip}` });
  }
  const company_name = company.company_name;

  // Decode + store photos (SSRF-safe: in-memory decode, never fetch URLs).
  const photoUrls = [];
  const decoded = [];
  try {
    const list = Array.isArray(photos) ? photos.slice(0, 3) : [];
    for (const p of list) {
      const { buffer, mime } = decodePhotoDataUrl(p?.dataUrl);
      const ext = MIME_EXT[mime] || "img";
      const filename = `${crypto.randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
      photoUrls.push(`/uploads/${filename}`);
      decoded.push({ buffer, mime });
    }
  } catch (err) {
    return res.status(400).json({ error: `Photo rejected: ${err.message}` });
  }

  try {
    // AI vision analysis (validated + clamped inside analyzeRoof).
    const { analysis } = await analyzeRoof(decoded);
    const { price_band_low, price_band_high } = priceBand(analysis.recommended_action, sqft, getSettings());

    // AI-generated "after" visualization for the before/after panel. Uses a real
    // image model when configured, else a deterministic offline preview derived
    // from the customer's first photo. Never fatal — null just hides the panel.
    let after_image_url = null;
    try {
      after_image_url = await generateAfterImage({
        beforePhoto: decoded[0] || null,
        analysis,
        uploadDir: UPLOAD_DIR,
        fileId: crypto.randomUUID(),
      });
    } catch (err) {
      console.error("[imagegen] failed:", err.message);
    }

    const record = createEstimationRequest({
      // Anonymous customer, or the company account if a signed-in company ran
      // the estimator itself (lets them edit the result).
      created_by_id: req.user?.id || null,
      company_id: company.id, // routed to the chosen roofing company
      viewed_by: [], // per-company "new" tracking
      company_name: String(company_name),
      email: String(email),
      square_footage: sqft,
      zip_code: zip,
      photo_urls: photoUrls,
      after_image_url,
      ai_output_raw: JSON.stringify(analysis),
      roof_type: analysis.roof_type,
      visible_damage: analysis.visible_damage_tags.join(", "),
      estimated_life_years: analysis.estimated_life_years,
      recommended_action: analysis.recommended_action,
      damage_severity: analysis.damage_severity,
      confidence: analysis.confidence,
      price_band_low,
      price_band_high,
      // Editable formal-estimate fields (company can revise these later).
      line_items: buildScope({
        action: analysis.recommended_action,
        roofType: analysis.roof_type,
        sqft,
        priceLow: price_band_low,
        priceHigh: price_band_high,
      }),
      notes: "",
      terms: DEFAULT_TERMS,
      valid_days: 30,
      estimate_edited_at: null,
      // Review workflow: draft until the company explicitly sends it.
      status: "draft",
      sent_at: null,
      email_sent: false,
      email_sent_at: null,
      contractor_notified: false,
      contractor_notified_at: null,
    });

    // Notify the contractor of the new lead now (no-op while email is off).
    // The customer-facing estimate is NOT sent yet: it starts as a draft the
    // company reviews and edits, then releases explicitly via /send.
    const settings = getSettings();
    let contractor_notified = false;
    if (EMAIL_ENABLED && settings?.contractor_email && isValidEmail(settings.contractor_email)) {
      try {
        const contractorBody = buildContractorEmail({
          companyName: company_name,
          email,
          zip: zip_code,
          sqft,
          analysis,
          priceLow: price_band_low,
          priceHigh: price_band_high,
          photoUrls,
        });
        const r = await sendEmail({ to: settings.contractor_email, subject: "New roof estimate lead", body: contractorBody, settings });
        contractor_notified = !!r.sent;
      } catch (err) {
        console.error("[email] contractor send failed:", err.message);
      }
    }

    const finalRecord = updateEstimationRequest(record.id, {
      estimate_number: estimateNumberFor(record),
      contractor_notified,
      contractor_notified_at: contractor_notified ? new Date().toISOString() : null,
    });

    res.json({
      success: true,
      id: record.id,
      summary: viewSummary(finalRecord || record, req.user),
    });
  } catch (err) {
    console.error("[processEstimationRequest] failed:", err);
    res.status(500).json({ error: "Could not process the estimate. Please try again." });
  }
});

// Records created before the review workflow have no status; treat them as
// already sent so nothing that was visible disappears.
const statusOf = (rec) => rec.status || "sent";

// Public-safe view of an estimate. Shared by create/read/update responses.
function buildSummary(rec) {
  const roof = roofTypeInfo(rec.roof_type);
  const action = actionInfo(rec.recommended_action);
  return {
    id: rec.id,
    status: statusOf(rec),
    sent_at: rec.sent_at || null,
    estimate_number: rec.estimate_number || estimateNumberFor(rec),
    company_id: rec.company_id || null,
    created_by_id: rec.created_by_id || null,
    created_date: rec.created_date,
    updated_date: rec.updated_date,
    estimate_edited_at: rec.estimate_edited_at || null,
    company_name: sanitizeText(rec.company_name, 80),
    email: rec.email,
    zip_code: rec.zip_code,
    square_footage: rec.square_footage,
    roof_type: rec.roof_type,
    // Plain-English glossary so customers understand the jargon (EPDM, TPO, ...).
    roof_type_label: roof.name,
    roof_type_blurb: roof.blurb,
    action_label: action.title,
    action_blurb: action.blurb,
    visible_damage: rec.visible_damage,
    damage_severity: rec.damage_severity,
    confidence: rec.confidence,
    estimated_life_years: rec.estimated_life_years,
    // Expected service life AFTER the recommended work (the number customers
    // actually care about — a replaced roof lasts decades, not "4 years").
    // Uses the contractor's value when they've set one, else a computed default.
    expected_life_years:
      rec.expected_life_years != null
        ? rec.expected_life_years
        : expectedLifeAfter(rec.recommended_action, rec.roof_type, rec.estimated_life_years),
    // Narrative overview of the problem and the fix. Recomputed from the current
    // fields so contractor edits are always reflected.
    overview: buildOverview(rec),
    recommended_action: rec.recommended_action,
    price_band_low: rec.price_band_low,
    price_band_high: rec.price_band_high,
    booking_link: getSettings()?.booking_link || "",
    before_image_url: rec.photo_urls?.[0] || null,
    after_image_url: rec.after_image_url || null,
    line_items:
      Array.isArray(rec.line_items) && rec.line_items.length ? rec.line_items : defaultLineItems(rec),
    notes: rec.notes || "",
    terms: rec.terms || DEFAULT_TERMS,
    valid_days: Number(rec.valid_days) || 30,
  };
}

// Public read of a single estimate summary (the UUID acts as a capability
// token so the anonymous customer can reload their confirmation page). While
// the estimate is still a draft, customers only get a "being reviewed" stub.
app.get("/api/estimation/:id", (req, res) => {
  const rec = getEstimationRequest(req.params.id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  res.json({ summary: viewSummary(rec, req.user) });
});

// Only the company the estimate is routed to (or the signed-in company that
// submitted it) may edit it.
function canEditEstimate(rec, user) {
  if (!user) return false;
  return rec.company_id === user.id || rec.created_by_id === user.id;
}

// What a given viewer is allowed to see: the full estimate once it has been
// sent (or if they are the owning company), otherwise a pending stub with no
// pricing or assessment details.
function viewSummary(rec, user) {
  if (statusOf(rec) === "sent" || canEditEstimate(rec, user)) return buildSummary(rec);
  return {
    id: rec.id,
    status: "draft",
    pending: true,
    estimate_number: rec.estimate_number || estimateNumberFor(rec),
    company_name: sanitizeText(rec.company_name, 80),
    email: rec.email,
    created_date: rec.created_date,
  };
}

const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));
const cents = (n) => Math.round(n * 100) / 100;

// Company edits the formal estimate. Every field is validated / sanitized and
// unknown fields are ignored.
app.put("/api/estimation/:id", requireAuth, (req, res) => {
  const rec = getEstimationRequest(req.params.id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  if (!canEditEstimate(rec, req.user)) {
    return res.status(403).json({ error: "You can only edit estimates routed to your company" });
  }

  const b = req.body || {};
  const patch = {};

  if (b.roof_type !== undefined) {
    const v = sanitizeText(b.roof_type, 40);
    if (!v) return res.status(400).json({ error: "Roof type cannot be empty" });
    patch.roof_type = v;
  }
  if (b.recommended_action !== undefined) {
    if (!ACTIONS.includes(b.recommended_action)) {
      return res.status(400).json({ error: "Recommendation must be repair, recoat or replace" });
    }
    patch.recommended_action = b.recommended_action;
  }
  if (b.estimated_life_years !== undefined) {
    const n = Number(b.estimated_life_years);
    if (!Number.isFinite(n)) return res.status(400).json({ error: "Estimated life must be a number" });
    patch.estimated_life_years = clampInt(n, 0, 60);
  }
  if (b.expected_life_years !== undefined) {
    const n = Number(b.expected_life_years);
    if (!Number.isFinite(n)) return res.status(400).json({ error: "Life after service must be a number" });
    patch.expected_life_years = clampInt(n, 0, 80);
  }
  if (b.visible_damage !== undefined) patch.visible_damage = sanitizeText(b.visible_damage, 200);

  if (b.price_band_low !== undefined || b.price_band_high !== undefined) {
    const low = Number(b.price_band_low ?? rec.price_band_low);
    const high = Number(b.price_band_high ?? rec.price_band_high);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < 0) {
      return res.status(400).json({ error: "Price range must be non-negative numbers" });
    }
    if (low > high) return res.status(400).json({ error: "Price range low end cannot exceed the high end" });
    patch.price_band_low = Math.round(low);
    patch.price_band_high = Math.round(high);
  }

  if (b.line_items !== undefined) {
    if (!Array.isArray(b.line_items) || b.line_items.length === 0) {
      return res.status(400).json({ error: "Add at least one line item" });
    }
    if (b.line_items.length > 25) return res.status(400).json({ error: "Too many line items (max 25)" });
    const items = [];
    for (const raw of b.line_items) {
      const description = sanitizeText(raw?.description, 120);
      if (!description) return res.status(400).json({ error: "Each line item needs a description" });
      const quantity = Number(raw?.quantity);
      const unit_price = Number(raw?.unit_price);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1e7) {
        return res.status(400).json({ error: `Invalid quantity for "${description}"` });
      }
      if (!Number.isFinite(unit_price) || unit_price < 0 || unit_price > 1e7) {
        return res.status(400).json({ error: `Invalid unit price for "${description}"` });
      }
      items.push({
        description,
        quantity: cents(quantity),
        unit: sanitizeText(raw?.unit || "", 16),
        unit_price: cents(unit_price),
      });
    }
    patch.line_items = items;
  }

  if (b.notes !== undefined) patch.notes = sanitizeMultiline(b.notes, 2000);
  if (b.terms !== undefined) patch.terms = sanitizeMultiline(b.terms, 2000);
  if (b.valid_days !== undefined) {
    const n = Number(b.valid_days);
    if (!Number.isFinite(n)) return res.status(400).json({ error: "Validity must be a number of days" });
    patch.valid_days = clampInt(n, 1, 365);
  }

  // --- Auto-recompute the cost estimate from the assessment drivers ---------
  // When the contractor changes the recommendation, roof type, price band or
  // damage and saves, the itemized scope of work (and therefore the total) is
  // regenerated so the cost always matches the new data.
  const finalAction = patch.recommended_action ?? rec.recommended_action;
  const sqft = Number(rec.square_footage) || 0;
  const bandProvided = b.price_band_low !== undefined || b.price_band_high !== undefined;

  // Changing the recommendation without hand-setting a new price band recomputes
  // the band from the company's configured per-sq-ft rates.
  if (patch.recommended_action !== undefined && !bandProvided) {
    const band = priceBand(finalAction, sqft, getSettings());
    patch.price_band_low = band.price_band_low;
    patch.price_band_high = band.price_band_high;
  }

  // Keep the expected life-after-service in step with a changed recommendation
  // unless the contractor set it explicitly in this edit.
  if (patch.recommended_action !== undefined && b.expected_life_years === undefined) {
    patch.expected_life_years = expectedLifeAfter(
      finalAction,
      patch.roof_type ?? rec.roof_type,
      patch.estimated_life_years ?? rec.estimated_life_years,
    );
  }

  // Regenerate the itemized scope unless the contractor supplied explicit line
  // items of their own (an intentional manual override).
  if (b.line_items === undefined) {
    patch.line_items = buildScope({
      action: finalAction,
      roofType: patch.roof_type ?? rec.roof_type,
      sqft,
      priceLow: patch.price_band_low ?? rec.price_band_low,
      priceHigh: patch.price_band_high ?? rec.price_band_high,
    });
  }

  patch.estimate_edited_at = new Date().toISOString();
  patch.estimate_edited_by = req.user.id;

  const updated = updateEstimationRequest(rec.id, patch);
  res.json({ summary: buildSummary(updated) });
});

// Company releases the reviewed estimate to the customer. Marks it sent and
// (when email is enabled) emails the customer's contact address. Re-sending
// after further edits is allowed.
app.post("/api/estimation/:id/send", requireAuth, async (req, res) => {
  const rec = getEstimationRequest(req.params.id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  if (!canEditEstimate(rec, req.user)) {
    return res.status(403).json({ error: "You can only send estimates routed to your company" });
  }

  const settings = getSettings();
  let email_sent = false;
  if (EMAIL_ENABLED) {
    try {
      // Attach the formal estimate as a PDF rather than repeating everything in
      // the body; the email itself is a short, professional cover note.
      const company = rec.company_id ? getAccountById(rec.company_id) : null;
      const pdf = await buildEstimatePdf({
        record: rec,
        company,
        settings: settings || DEFAULT_SETTINGS,
        uploadDir: UPLOAD_DIR,
      });
      const number = (rec.estimate_number || estimateNumberFor(rec)).replace(/[^A-Za-z0-9-]/g, "");
      const body = buildProspectEmail({
        companyName: rec.company_name,
        bookingLink: settings?.booking_link || "",
      });
      const r = await sendEmail({
        to: rec.email,
        subject: `Your roof estimate from ${rec.company_name}`,
        body,
        fromName: rec.company_name,
        attachments: [{ filename: `${number}.pdf`, content: pdf }],
        settings,
      });
      email_sent = !!r.sent;
    } catch (err) {
      console.error("[email] prospect send failed:", err.message);
    }
  }

  const now = new Date().toISOString();
  const updated = updateEstimationRequest(rec.id, {
    status: "sent",
    sent_at: rec.sent_at || now,
    last_sent_at: now,
    sent_by: req.user.id,
    email_sent: email_sent || !!rec.email_sent,
    email_sent_at: email_sent ? now : rec.email_sent_at || null,
  });
  res.json({ summary: buildSummary(updated), email_enabled: EMAIL_ENABLED, email_delivered: email_sent });
});

// Formal estimate as a downloadable PDF. Once sent it is public like the
// summary read (the UUID is the customer's capability token); while still a
// draft only the owning company may download it.
app.get("/api/estimation/:id/pdf", async (req, res) => {
  const rec = getEstimationRequest(req.params.id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  if (statusOf(rec) !== "sent" && !canEditEstimate(rec, req.user)) {
    return res.status(403).json({ error: "This estimate has not been sent yet" });
  }
  try {
    const company = rec.company_id ? getAccountById(rec.company_id) : null;
    const pdf = await buildEstimatePdf({
      record: rec,
      company,
      settings: getSettings() || DEFAULT_SETTINGS,
      uploadDir: UPLOAD_DIR,
    });
    const number = (rec.estimate_number || estimateNumberFor(rec)).replace(/[^A-Za-z0-9-]/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${number}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (err) {
    console.error("[pdf] generation failed:", err);
    res.status(500).json({ error: "Could not generate the PDF. Please try again." });
  }
});

// --- Company: leads inbox + logistics ---

app.get("/api/leads", requireAuth, (req, res) => {
  const items = listEstimationRequests(200)
    .filter((r) => r.company_id === req.user.id)
    .map((r) => ({
      ...r,
      is_new: !Array.isArray(r.viewed_by) || !r.viewed_by.includes(req.user.id),
    }));
  res.json({ items });
});

app.post("/api/leads/:id/viewed", requireAuth, (req, res) => {
  const rec = markRequestViewed(req.params.id, req.user.id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/settings", requireAuth, (_req, res) => {
  res.json({ settings: getSettings() || DEFAULT_SETTINGS });
});

app.put("/api/settings", requireAuth, (req, res) => {
  const b = req.body || {};
  // Validate the email-ish fields when present; empty string is allowed.
  for (const field of ["contractor_email", "cc_email", "reply_to_email", "resend_from_email"]) {
    if (b[field] && !isValidEmail(b[field])) {
      return res.status(400).json({ error: `Invalid ${field.replace(/_/g, " ")}` });
    }
  }
  const numeric = ["repair_low", "repair_high", "recoat_low", "recoat_high", "replace_low", "replace_high"];
  const patch = {
    contractor_email: String(b.contractor_email || ""),
    booking_link: String(b.booking_link || ""),
    email_provider: b.email_provider === "resend" ? "resend" : "base44",
    cc_email: String(b.cc_email || ""),
    reply_to_email: String(b.reply_to_email || ""),
    resend_from_email: String(b.resend_from_email || ""),
    service_area: String(b.service_area || ""),
  };
  for (const key of numeric) {
    const n = Number(b[key]);
    if (Number.isFinite(n) && n >= 0) patch[key] = n;
  }
  res.json({ settings: saveSettings(patch) });
});

// --- Production static serving of the built SPA ---
if (process.env.NODE_ENV === "production") {
  const dist = path.join(here, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`\n  Roof Estimator API listening on http://localhost:${PORT}`);
  console.log(`  AI vision: ${process.env.ANTHROPIC_API_KEY ? "Claude (live)" : "mock (no ANTHROPIC_API_KEY)"}`);
  console.log(`  AI after image: ${process.env.OPENAI_API_KEY ? "photo edit (live)" : "offline preview (no OPENAI_API_KEY)"}`);
  console.log(`  Email: ${emailStatus()}\n`);
});
