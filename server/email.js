// Email dispatch. Provider and credentials are driven entirely by environment
// variables so the setup is easy to change without touching code:
//
//   EMAIL_PROVIDER = console | smtp | resend   (default: auto)
//   EMAIL_FROM       address shown in the From header (e.g. isha.test888@gmail.com)
//   EMAIL_FROM_NAME  optional display name for the From header
//   EMAIL_CC         optional cc address
//   EMAIL_REPLY_TO   optional reply-to address
//
//   # SMTP (Gmail and any SMTP server)
//   SMTP_HOST=smtp.gmail.com   SMTP_PORT=465
//   SMTP_USER=isha.test888@gmail.com   SMTP_PASS=<gmail app password>
//
//   # Resend (hosted API — requires a verified sending domain)
//   RESEND_API_KEY=...
//
// SECURITY: recipients are validated (RFC-5321-ish), all user text is sanitized
// in the templates below, provider URLs/hosts are fixed here (never from the DB),
// and provider error bodies are logged server-side only — never surfaced.

import nodemailer from "nodemailer";
import { isValidEmail, sanitizeText } from "./security.js";

const RESEND_URL = "https://api.resend.com/emails"; // hardcoded — never from config

// --- Configuration (read once at startup) ---------------------------------
const SMTP = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
};
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.Resend || "";
const FROM_EMAIL = (process.env.EMAIL_FROM || SMTP.user || "").trim();
const FROM_NAME = (process.env.EMAIL_FROM_NAME || "").trim();
const CC = (process.env.EMAIL_CC || "").trim();
const REPLY_TO = (process.env.EMAIL_REPLY_TO || "").trim();

// Choose a provider: explicit EMAIL_PROVIDER wins; otherwise auto-detect from
// whichever credentials are present, falling back to a console logger so the
// app always runs (and is testable) with no email setup at all.
function resolveProvider() {
  const explicit = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (SMTP.user && SMTP.pass) return "smtp";
  if (RESEND_KEY) return "resend";
  return "console";
}
const PROVIDER = resolveProvider();

// Is the chosen provider actually able to deliver right now?
function providerReady() {
  if (PROVIDER === "console") return true; // logs instead of sending
  if (PROVIDER === "smtp") return !!(SMTP.user && SMTP.pass && isValidEmail(FROM_EMAIL));
  if (PROVIDER === "resend") return !!(RESEND_KEY && isValidEmail(FROM_EMAIL));
  return false;
}

export const EMAIL_PROVIDER = PROVIDER;
export const EMAIL_ENABLED = providerReady();

// One-line summary for the startup banner.
export function emailStatus() {
  if (!EMAIL_ENABLED) {
    if (PROVIDER === "smtp") return `smtp not ready (set SMTP_USER / SMTP_PASS / EMAIL_FROM)`;
    if (PROVIDER === "resend") return `resend not ready (set RESEND_API_KEY / EMAIL_FROM)`;
    return "disabled";
  }
  if (PROVIDER === "console") return "console (logs emails, does not deliver)";
  return `${PROVIDER} as ${FROM_EMAIL}`;
}

// Lazily created SMTP transport (reused across sends).
let transport = null;
function smtpTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transport;
}

// Build the From header. The display name defaults to EMAIL_FROM_NAME but each
// send can override it (so the customer sees the roofing company's name). The
// address is always the authenticated account — Gmail requires that — while the
// name is sanitized to prevent header injection.
function senderName(override) {
  return sanitizeText(override || FROM_NAME || "", 80);
}
function fromHeaderString(override) {
  const name = senderName(override);
  return name ? `${JSON.stringify(name)} <${FROM_EMAIL}>` : FROM_EMAIL;
}

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// Prospect (customer) email. The full assessment, scope and pricing are in the
// attached PDF, so the body stays short and professional. Built only from a
// sanitized company name + a validated booking link.
export function buildProspectEmail({ companyName, bookingLink }) {
  const company = sanitizeText(companyName, 80) || "Our team";
  const lines = [
    `Hello,`,
    ``,
    `Thank you for sharing photos of your roof with ${company}. Our team has ` +
      `carefully reviewed the images you provided and assessed the roof's type, ` +
      `condition, and remaining service life. Based on that analysis, we have ` +
      `prepared a detailed estimate for the work we recommend.`,
    ``,
    `Your personalized estimate is attached to this email as a PDF. It outlines ` +
      `our findings, the recommended scope of work, and the associated pricing.`,
    ``,
    `If you would like to move forward with the project, or if you have any ` +
      `questions about the estimate, simply reply to this email and a member of ` +
      `our team will be glad to help you arrange the next steps.`,
    ``,
  ];
  if (bookingLink && /^https?:\/\//i.test(bookingLink)) {
    lines.push(`You can also schedule a free on-site inspection here: ${bookingLink}`, ``);
  }
  lines.push(`We look forward to working with you.`, ``, `Warm regards,`, company);
  return lines.join("\n");
}

export function buildContractorEmail({ companyName, email, zip, sqft, analysis, priceLow, priceHigh, photoUrls }) {
  return [
    `New roof estimate lead`,
    ``,
    `Company: ${sanitizeText(companyName, 80)}`,
    `Email: ${isValidEmail(email) ? email : "(invalid)"}`,
    `ZIP: ${sanitizeText(zip, 12)}`,
    `Building: ${Number(sqft) || 0} sq ft`,
    ``,
    `Roof type: ${analysis.roof_type}`,
    `Severity: ${analysis.damage_severity} (${analysis.confidence} confidence)`,
    `Defects: ${analysis.visible_damage_tags.join(", ")}`,
    `Est. life: ${analysis.estimated_life_years} years`,
    `Recommendation: ${analysis.recommended_action}`,
    `Price band: ${money(priceLow)} - ${money(priceHigh)}`,
    ``,
    `Photos:`,
    ...(photoUrls || []).map((u) => `  ${u}`),
  ].join("\n");
}

/**
 * Send an email through the configured provider. Returns { sent, skipped? }.
 * Options:
 *   to, subject, body   the message
 *   fromName            display name for the From header (e.g. the roofing
 *                       company). The address is always the authenticated one.
 *   attachments         [{ filename, content: Buffer }] — e.g. the estimate PDF
 *   settings            used for optional cc / reply-to fallbacks
 * Never throws provider internals to the caller — logs detail server-side and
 * throws a generic error instead. When email is not configured it is a no-op.
 */
export async function sendEmail({ to, subject, body, settings, fromName, attachments }) {
  if (!EMAIL_ENABLED) return { sent: false, skipped: true };
  if (!isValidEmail(to)) throw new Error("Invalid recipient address");

  const cc = CC || (settings?.cc_email && isValidEmail(settings.cc_email) ? settings.cc_email : "");
  const replyTo =
    REPLY_TO || (settings?.reply_to_email && isValidEmail(settings.reply_to_email) ? settings.reply_to_email : "");
  const files = Array.isArray(attachments) ? attachments.filter((a) => a && a.filename && a.content) : [];

  if (PROVIDER === "console") {
    const att = files.length ? `\n  Attachments: ${files.map((a) => `${a.filename} (${a.content.length} bytes)`).join(", ")}` : "";
    console.log(
      `\n[email:console] would send:\n  From: ${fromHeaderString(fromName)}\n  To: ${to}` +
        `${cc ? `\n  Cc: ${cc}` : ""}\n  Subject: ${subject}${att}\n${body}\n`,
    );
    return { sent: true };
  }

  if (PROVIDER === "smtp") {
    if (!isValidEmail(FROM_EMAIL)) throw new Error("Invalid sender address");
    try {
      await smtpTransport().sendMail({
        from: { name: senderName(fromName), address: FROM_EMAIL },
        to,
        subject,
        text: body,
        ...(cc ? { cc } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(files.length ? { attachments: files.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
      });
      return { sent: true };
    } catch (err) {
      console.error("[email] SMTP send failed:", err?.message || err);
      throw new Error("Email delivery failed");
    }
  }

  if (PROVIDER === "resend") {
    if (!isValidEmail(FROM_EMAIL)) throw new Error("Invalid sender address");
    const payload = { from: fromHeaderString(fromName), to, subject, text: body };
    if (cc) payload.cc = cc;
    if (replyTo) payload.reply_to = replyTo;
    if (files.length) {
      payload.attachments = files.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
      }));
    }
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[email] Resend non-2xx:", res.status, await res.text().catch(() => ""));
      throw new Error("Email provider request failed");
    }
    return { sent: true };
  }

  console.error(`[email] Unknown EMAIL_PROVIDER "${PROVIDER}"`);
  throw new Error("Email provider not configured");
}
