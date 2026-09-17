// Lightweight auth for the standalone app. Tokens are HMAC-signed JSON so the
// server can trust the account claim without a database session. This is a
// local dev-grade replacement for Base44's hosted auth (base44.auth.me()).
//
// Only company / contractor accounts authenticate. Customers requesting an
// estimate never sign in — they submit the public form anonymously.

import crypto from "node:crypto";

const SECRET = process.env.APP_SECRET || "dev-secret-change-me";

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

// user = { id, email, company_name, role: "company" }
export function issueToken(user) {
  const payloadB64 = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  // Constant-time compare.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Express middleware: attaches req.user from the Bearer token, or null.
export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.user = token ? verifyToken(token) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}
