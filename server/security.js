// Security helpers shared by the backend: input validation, sanitization,
// SSRF-safe photo decoding, and a simple in-memory rate limiter.

// RFC-5321-ish address validation. Deliberately strict: single address only,
// no display names, no control chars.
export const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(addr) {
  return typeof addr === "string" && addr.length <= 254 && EMAIL_RE.test(addr);
}

// Strict data-URL shape: data:<mime>;base64,<payload>
export const DATA_URL_RE =
  /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * SSRF-safe: decode a base64 image data URL entirely in memory. We never fetch
 * user-supplied URLs. Throws on any validation failure.
 * @returns {{ buffer: Buffer, mime: string }}
 */
export function decodePhotoDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") throw new Error("Photo must be a data URL string");
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error("Photo is not a valid base64 image data URL");

  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new Error(`Unsupported image type: ${mime}`);
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    throw new Error("Photo base64 could not be decoded");
  }

  if (buffer.length === 0) throw new Error("Photo is empty");
  if (buffer.length > MAX_PHOTO_BYTES) throw new Error("Photo exceeds 8MB limit");

  return { buffer, mime };
}

/**
 * Strip everything that could be used for header/body injection or that isn't
 * on the safe allow-list, then cap length. Used for any user text that ends up
 * templated into an email.
 */
export function sanitizeText(input, maxLen = 120) {
  if (input == null) return "";
  let s = String(input);
  s = s.replace(/<[^>]*>/g, " "); // HTML tags
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, " "); // URLs
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " "); // emails
  s = s.replace(/[\x00-\x1F\x7F]/g, " "); // all control chars incl CR/LF
  s = s.replace(/[^A-Za-z0-9 .,&'()/#:$%-]/g, ""); // allow-list
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

/**
 * Lighter sanitizer for multi-line free text (estimate notes / terms) that is
 * only ever rendered as plain text (React-escaped or drawn into a PDF). Strips
 * HTML tags and control characters but preserves line breaks.
 */
export function sanitizeMultiline(input, maxLen = 2000) {
  if (input == null) return "";
  let s = String(input).replace(/\r\n?/g, "\n");
  s = s.replace(/<[^>]*>/g, " "); // HTML tags
  s = s.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ""); // control chars except \n
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

// Per-user, in-memory rate limiter. Fixed window per key.
export function createRateLimiter({ max = 5, windowMs = 60 * 60 * 1000 } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }
  return function take(key) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: max - 1 };
    }
    if (bucket.count >= max) {
      return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return { ok: true, remaining: max - bucket.count };
  };
}
