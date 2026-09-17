// Plain-English estimate copy derived from the (already validated) roof
// analysis: a customer-facing overview of the problem and the fix, a glossary
// that decodes roof-type jargon (EPDM, TPO, ...), the expected service life
// AFTER the recommended work, and a professional itemized scope of work whose
// total tracks the price band.
//
// SECURITY: everything here is built from validated enum values and numbers we
// format ourselves, plus the contractor's own sanitized damage text. No
// untrusted model prose is interpolated.

import { ACTIONS } from "./llm.js";

// What each roof type actually is, in words a building owner understands.
export const ROOF_TYPE_INFO = {
  TPO: {
    name: "TPO (thermoplastic polyolefin) membrane",
    blurb:
      "a single-ply white membrane that reflects heat and resists UV, very common on flat commercial roofs",
  },
  EPDM: {
    name: "EPDM rubber membrane",
    blurb:
      "a durable single-ply synthetic-rubber membrane (often called “rubber roofing”) known for long life and weather resistance on low-slope roofs",
  },
  "modified bitumen": {
    name: "modified-bitumen membrane",
    blurb:
      "an asphalt-based membrane reinforced with polymers and installed in layers, used on flat and low-slope roofs",
  },
  "built-up": {
    name: "built-up roof (BUR, the classic “tar-and-gravel” system)",
    blurb:
      "multiple layers of asphalt and reinforcing fabric topped with gravel — a rugged, traditional flat-roof system",
  },
  metal: {
    name: "metal roof",
    blurb:
      "steel or aluminum panels that are long-lasting and low-maintenance, used on both flat and sloped commercial buildings",
  },
  "clay tile": {
    name: "clay tile roof",
    blurb:
      "fired clay tiles that last for decades and resist fire and rot, typical on sloped roofs",
  },
  shingle: {
    name: "asphalt shingle roof",
    blurb:
      "overlapping asphalt shingles — an economical and common system, mostly on sloped roofs",
  },
  unknown: {
    name: "roof system",
    blurb: "the exact membrane type will be confirmed during the on-site inspection",
  },
};

export function roofTypeInfo(roofType) {
  return ROOF_TYPE_INFO[roofType] || ROOF_TYPE_INFO.unknown;
}

// What each recommended action means and involves.
export const ACTION_INFO = {
  repair: {
    verb: "repair",
    title: "Targeted repair",
    blurb:
      "We fix the specific problem areas — sealing, patching and reinforcing the affected spots — while leaving the sound majority of the roof in place. This is the most cost-effective option when the damage is localized and the roof still has good life left.",
  },
  recoat: {
    verb: "recoat",
    title: "Restoration & recoating",
    blurb:
      "We clean the roof, repair the problem areas, then apply a fresh protective coating across the whole surface. This renews the roof's waterproofing and reflectivity and adds years of service without a full tear-off.",
  },
  replace: {
    verb: "replace",
    title: "Full replacement",
    blurb:
      "We remove the failing roof down to the deck and install a brand-new membrane with new flashings and details. This is recommended when the damage is widespread or the roof has reached the end of its service life.",
  },
};

export function actionInfo(action) {
  return ACTION_INFO[action] || ACTION_INFO.repair;
}

// Typical service life of a NEW roof of each type (years). Used to explain the
// expected life AFTER the recommended work, not the remaining life of the
// current, damaged roof.
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

// Expected remaining service life once the recommended work is done.
//  - replace: the life of a brand-new roof of that type.
//  - recoat:  current remaining life plus ~12 years from the new coating.
//  - repair:  current remaining life, modestly extended by the repairs.
export function expectedLifeAfter(action, roofType, currentLife) {
  const full = NEW_ROOF_LIFE[roofType] ?? 20;
  const cur = Math.max(0, Number(currentLife) || 0);
  if (action === "replace") return full;
  if (action === "recoat") return Math.min(full, Math.max(cur + 12, 12));
  return Math.min(full, Math.max(cur + 4, 6)); // repair
}

const round2 = (n) => Math.round(n * 100) / 100;

// Build a professional, itemized scope of work whose line-item total equals the
// midpoint of the price band. Buckets and weights vary by action; the last line
// absorbs any rounding remainder so the items always sum exactly to the total.
export function buildScope({ action, roofType, sqft, priceLow, priceHigh }) {
  const a = ACTIONS.includes(action) ? action : "repair";
  const area = Math.max(0, Math.round(Number(sqft) || 0));
  const low = Math.max(0, Number(priceLow) || 0);
  const high = Math.max(0, Number(priceHigh) || 0);
  const total = Math.round((low + high) / 2);
  const roofWord =
    roofType && roofType !== "unknown" ? roofType : "roof";

  const templates = {
    replace: [
      { w: 0.05, desc: "Mobilization, site protection and permits" },
      { w: 0.2, desc: `Tear-off and disposal of the existing ${roofWord} system` },
      { w: 0.1, desc: "Deck inspection and substrate / insulation preparation" },
      { w: 0.35, desc: `New ${roofWord} membrane — materials and installation`, bySqft: true },
      { w: 0.2, desc: "New flashings, edge metal and penetration details" },
      { w: 0.1, desc: "Cleanup, debris removal and workmanship warranty" },
    ],
    recoat: [
      { w: 0.06, desc: "Mobilization and site protection" },
      { w: 0.2, desc: "Power-wash, clean and prepare the roof surface" },
      { w: 0.22, desc: "Repair seams, blisters and problem areas prior to coating" },
      { w: 0.42, desc: `Apply protective coating over the ${roofWord} surface`, bySqft: true },
      { w: 0.1, desc: "Cleanup, final inspection and coating warranty" },
    ],
    repair: [
      { w: 0.1, desc: "Mobilization and site protection" },
      { w: 0.35, desc: `Repair materials for the affected ${roofWord} areas` },
      { w: 0.4, desc: "Labor to patch, reinforce and secure the damaged areas" },
      { w: 0.1, desc: "Seal and waterproof repaired seams and penetrations" },
      { w: 0.05, desc: "Cleanup and final inspection" },
    ],
  };

  const rows = templates[a];
  const items = [];
  let running = 0;
  rows.forEach((r, i) => {
    const isLast = i === rows.length - 1;
    let amount = isLast ? Math.max(0, total - running) : Math.round(total * r.w);
    if (r.bySqft && area > 0) {
      const unitPrice = round2(amount / area);
      amount = Math.round(unitPrice * area);
      // Re-derive from the last line if this adjustment shifted the running sum.
      items.push({ description: r.desc, quantity: area, unit: "sq ft", unit_price: unitPrice });
    } else {
      items.push({ description: r.desc, quantity: 1, unit: "lot", unit_price: Math.round(amount) });
    }
    running += amount;
  });
  // Guarantee an exact total: nudge the final line by any residual.
  const sum = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const residual = total - sum;
  if (residual !== 0 && items.length) {
    const last = items[items.length - 1];
    if (last.unit === "sq ft" && last.quantity > 0) {
      last.unit_price = round2(last.unit_price + residual / last.quantity);
    } else {
      last.unit_price = Math.round(last.unit_price + residual / (last.quantity || 1));
    }
  }
  return items;
}

// A customer-facing narrative: what the roof is, what's wrong, and how we'll fix
// it. Built entirely from validated fields so it always matches the estimate and
// updates automatically when the contractor edits it.
export function buildOverview(rec) {
  const roof = roofTypeInfo(rec.roof_type);
  const action = actionInfo(rec.recommended_action);
  const severity = rec.damage_severity || "moderate";
  const damage = String(rec.visible_damage || "").trim();
  const curLife = Math.max(0, Number(rec.estimated_life_years) || 0);
  const afterLife =
    rec.expected_life_years != null
      ? Math.max(0, Number(rec.expected_life_years) || 0)
      : expectedLifeAfter(rec.recommended_action, rec.roof_type, curLife);

  const severityText =
    {
      none: "in good overall condition, with no significant defects",
      minor: "showing early, mostly cosmetic wear",
      moderate: "showing moderate wear that should be addressed soon",
      severe: "showing advanced, widespread deterioration",
    }[severity] || "showing wear that should be addressed";

  const yrs = (n) => `${n} year${n === 1 ? "" : "s"}`;
  const article = (word) => (/^[aeiou]/i.test(String(word).trim()) ? "an" : "a");

  const p1 = `Your building has ${article(roof.name)} ${roof.name} — ${roof.blurb}. From the photos you provided, it is currently ${severityText}.`;

  const hasDamage = damage && damage.toLowerCase() !== "none";
  const p2 = hasDamage
    ? `Our photo inspection identified: ${damage}. Left unaddressed, problems like these let water work its way under the surface and spread, which shortens the roof's life and risks leaks into the space below.`
    : `Our photo inspection did not flag major surface damage, but normal wear was noted. Staying ahead of it now protects the building and avoids larger costs later.`;

  const lifeText =
    rec.recommended_action === "replace"
      ? `The existing roof has only about ${yrs(curLife)} of service left at its current condition. A newly installed ${roofWordFor(rec.roof_type)} typically lasts about ${yrs(afterLife)}.`
      : `At its current condition the roof has about ${yrs(curLife)} of service left; the work below is expected to extend that to roughly ${yrs(afterLife)}.`;

  const p3 = `Our recommendation — ${action.title.toLowerCase()}: ${action.blurb} ${lifeText}`;

  return [p1, p2, p3].join("\n\n");
}

function roofWordFor(roofType) {
  if (!roofType || roofType === "unknown") return "roof";
  return roofTypeInfo(roofType).name;
}
