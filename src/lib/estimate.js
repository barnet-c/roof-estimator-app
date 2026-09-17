// Client-side mirrors of the server's estimate helpers, used only for live
// preview in the editor. The server remains authoritative — it recomputes the
// scope and totals on save. Keep these in sync with server/narrative.js.

const NEW_ROOF_LIFE = {
  TPO: 22,
  EPDM: 25,
  "modified bitumen": 20,
  "built-up": 25,
  metal: 40,
  "clay tile": 50,
  shingle: 22,
  unknown: 20,
};

export function expectedLifeAfter(action, roofType, currentLife) {
  const full = NEW_ROOF_LIFE[roofType] ?? 20;
  const cur = Math.max(0, Number(currentLife) || 0);
  if (action === "replace") return full;
  if (action === "recoat") return Math.min(full, Math.max(cur + 12, 12));
  return Math.min(full, Math.max(cur + 4, 6)); // repair
}

// Per-sq-ft rate keys in AppSettings, by action.
export const RATE_KEYS = {
  repair: ["repair_low", "repair_high"],
  recoat: ["recoat_low", "recoat_high"],
  replace: ["replace_low", "replace_high"],
};

// Recompute a price band from the company's configured rates × roof area.
export function bandFromRates(action, sqft, settings) {
  const [lo, hi] = RATE_KEYS[action] || RATE_KEYS.repair;
  const area = Math.max(0, Number(sqft) || 0);
  return {
    price_band_low: Math.round((Number(settings?.[lo]) || 0) * area),
    price_band_high: Math.round((Number(settings?.[hi]) || 0) * area),
  };
}
