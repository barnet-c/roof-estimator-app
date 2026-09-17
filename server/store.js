// Tiny JSON-file persistence layer standing in for Base44's hosted entities
// (EstimationRequest + AppSettings). Not concurrent-safe at scale, but fine for
// a local single-process app. Writes are synchronous and atomic-ish.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Lives OUTSIDE server/ so writes never trigger `node --watch` restarts.
const DATA_DIR = path.join(here, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

export const DEFAULT_SETTINGS = {
  contractor_email: "",
  booking_link: "",
  email_provider: "base44", // base44 | resend
  cc_email: "",
  reply_to_email: "",
  resend_from_email: "",
  service_area: "",
  repair_low: 3,
  repair_high: 8,
  recoat_low: 4,
  recoat_high: 12,
  replace_low: 8,
  replace_high: 20,
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ estimationRequests: [], settings: null, accounts: [] }, null, 2),
    );
  }
}

function read() {
  ensureStore();
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(db.accounts)) db.accounts = [];
    if (!Array.isArray(db.estimationRequests)) db.estimationRequests = [];
    return db;
  } catch {
    return { estimationRequests: [], settings: null, accounts: [] };
  }
}

function write(db) {
  ensureStore();
  const json = JSON.stringify(db, null, 2);
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, json);
  // Atomic rename, but Windows can intermittently throw EPERM when another
  // handle (search indexer / AV) briefly locks the target. Retry a few times,
  // then fall back to a direct in-place write.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, DATA_FILE);
      return;
    } catch (err) {
      if (err.code === "EPERM" && attempt < 10) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        continue;
      }
      // Give up on the atomic swap; write directly so data isn't lost.
      try {
        fs.writeFileSync(DATA_FILE, json);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return;
      } catch {
        throw err;
      }
    }
  }
}

// --- EstimationRequest ---

export function createEstimationRequest(record) {
  const db = read();
  const now = new Date().toISOString();
  const full = { id: crypto.randomUUID(), created_date: now, updated_date: now, ...record };
  db.estimationRequests.push(full);
  write(db);
  return full;
}

export function updateEstimationRequest(id, patch) {
  const db = read();
  const idx = db.estimationRequests.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db.estimationRequests[idx] = {
    ...db.estimationRequests[idx],
    ...patch,
    updated_date: new Date().toISOString(),
  };
  write(db);
  return db.estimationRequests[idx];
}

export function getEstimationRequest(id) {
  return read().estimationRequests.find((r) => r.id === id) || null;
}

// Mirrors EstimationRequest.list('-created_date', limit).
export function listEstimationRequests(limit = 200) {
  const rows = read().estimationRequests.slice();
  rows.sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
  return rows.slice(0, limit);
}

// Mark a request as seen by a given company account (clears the "new" dot).
export function markRequestViewed(id, accountId) {
  const db = read();
  const rec = db.estimationRequests.find((r) => r.id === id);
  if (!rec) return null;
  if (!Array.isArray(rec.viewed_by)) rec.viewed_by = [];
  if (!rec.viewed_by.includes(accountId)) {
    rec.viewed_by.push(accountId);
    write(db);
  }
  return rec;
}

// --- Company accounts ---

export function createAccount({ company_name, email, description }) {
  const db = read();
  const account = {
    id: crypto.randomUUID(),
    company_name: String(company_name),
    email: String(email).toLowerCase(),
    description: String(description || ""),
    service_zips: [], // ZIP codes this company serves
    role: "company",
    created_date: new Date().toISOString(),
  };
  db.accounts.push(account);
  write(db);
  return account;
}

export function getAccountByEmail(email) {
  return read().accounts.find((a) => a.email === String(email).toLowerCase()) || null;
}

export function getAccountById(id) {
  return read().accounts.find((a) => a.id === id) || null;
}

export function listAccounts() {
  return read().accounts.slice();
}

// Patch a company account (only known fields are applied by the caller).
export function updateAccount(id, patch) {
  const db = read();
  const idx = db.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  db.accounts[idx] = { ...db.accounts[idx], ...patch };
  write(db);
  return db.accounts[idx];
}


// --- AppSettings (single record) ---

export function getSettings() {
  const db = read();
  return db.settings || null;
}

export function saveSettings(patch) {
  const db = read();
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}), ...patch };
  write(db);
  return db.settings;
}
