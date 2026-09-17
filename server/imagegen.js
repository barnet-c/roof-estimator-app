// AI "after" visualization for the before/after panel on the confirmation page.
//
// With an image key configured we call a real model to EDIT the customer's own
// photo — repairing the roof (removing damage) while keeping the same building,
// camera angle, colors and lighting. That image-to-image edit is the only way to
// show a genuinely repaired roof. Without a key we synthesize a deterministic,
// offline preview from the photo so the app stays runnable with no keys — but
// note that offline filters can only clean/brighten the surface, they cannot
// truly reconstruct a flawless roof; a real key is needed for that.
//
// The endpoint is hardcoded (never user-supplied) and the prompt is built only
// from validated enum fields — never free-form or in-image text.

import fs from "node:fs";
import path from "node:path";

const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

export const IMAGEGEN_LIVE = !!process.env.OPENAI_API_KEY;

// Image formats the edit endpoint accepts as input.
const EDITABLE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const ACTION_TINT = {
  repair: "#34d399",
  recoat: "#fbbf24",
  replace: "#fb7c3a",
};

// Repair-and-preserve instruction: fix the roof, change nothing else. The
// prompt is a fixed constant — it deliberately does NOT name a roof type or
// material (the analysis may be mocked or wrong) so the model keeps whatever
// material is actually in the photo instead of swapping it for something else.
const EDIT_PROMPT =
  `Repair the roof in this photo so it is the same roof in perfect, newly restored ` +
  `condition. Replace every missing, broken, cracked, loose or displaced piece with ` +
  `matching pieces of the exact same material, color, size, texture and pattern as the ` +
  `existing roof. Close all holes and gaps, straighten sagging areas, and remove moss, ` +
  `stains, rust, patches, ponding water and debris so the surface is complete, even and ` +
  `uniform. Do not change the roofing material, its color, or its texture. Keep the same ` +
  `building, camera angle, composition, framing, lighting, shadows, sky, weather and ` +
  `surroundings. Change nothing except repairing the roof.`;

function buildEditPrompt() {
  return EDIT_PROMPT;
}

// Live image-to-image edit: sends the customer's actual photo and returns a
// repaired version, preserving everything but the roof surface.
async function editWithOpenAI({ beforePhoto, outPath }) {
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("prompt", buildEditPrompt());
  // "auto" keeps an output aspect close to the source photo instead of forcing a
  // square crop. NOTE: do not add input_fidelity=high — it consistently trips
  // the provider's safety filter (400) on ordinary roof photos.
  form.append("size", "auto");
  const ext = beforePhoto.mime === "image/webp" ? "webp" : beforePhoto.mime === "image/png" ? "png" : "jpg";
  form.append("image", new Blob([beforePhoto.buffer], { type: beforePhoto.mime }), `roof.${ext}`);

  const res = await fetch(OPENAI_EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`image API responded ${res.status}`);
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
}

// Deterministic offline preview. We can't truly reconstruct pixels without a
// generative model, but we can make the roof read as REPAIRED (not still broken):
// blur-average the surface so cracks, stains, patches and ponding dissolve into
// the photo's own colors/lighting, brighten slightly for freshness, then lay a
// clean uniform seam grid on top so it reads as a fresh, intact membrane.
function buildPreviewSvg({ beforePhoto, analysis }) {
  const tint = ACTION_TINT[analysis.recommended_action] || "#fb7c3a";

  if (beforePhoto) {
    const dataUri = `data:${beforePhoto.mime};base64,${beforePhoto.buffer.toString("base64")}`;
    // Uniform seam grid — the crisp structure that makes a blurred surface read
    // as a clean paneled roof rather than a smear.
    const vSeams = [64, 128, 192, 256, 320, 384, 448]
      .map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="512"/>`)
      .join("");
    const hSeams = [64, 128, 192, 256, 320, 384, 448]
      .map((y) => `<line x1="0" y1="${y}" x2="512" y2="${y}"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <filter id="repair" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur stdDeviation="22"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.12" intercept="0.05"/>
        <feFuncG type="linear" slope="1.12" intercept="0.05"/>
        <feFuncB type="linear" slope="1.12" intercept="0.05"/>
      </feComponentTransfer>
      <feColorMatrix type="saturate" values="1.15"/>
    </filter>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.5" stop-color="${tint}" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <!-- Damaged surface blurred into a clean, uniform field of the photo's own color/light -->
  <image href="${dataUri}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid slice" filter="url(#repair)"/>
  <!-- Fresh membrane seams -->
  <g stroke="#000000" stroke-opacity="0.10" stroke-width="2">${vSeams}${hSeams}</g>
  <g stroke="#ffffff" stroke-opacity="0.08" stroke-width="1" transform="translate(1,1)">${vSeams}${hSeams}</g>
  <rect x="0" y="0" width="512" height="512" fill="url(#sheen)"/>
</svg>`;
  }

  // No source photo: illustrative fresh roof.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b2b33"/>
      <stop offset="1" stop-color="#3a3540"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="40" y="40" width="432" height="432" rx="14" fill="#4b5563"/>
  <g stroke="${tint}" stroke-opacity="0.5" stroke-width="3">
    ${[112, 184, 256, 328, 400].map((x) => `<line x1="${x}" y1="48" x2="${x}" y2="464"/>`).join("\n    ")}
  </g>
  <rect x="96" y="96" width="90" height="70" rx="8" fill="#6b7280"/>
  <rect x="320" y="300" width="110" height="80" rx="8" fill="#6b7280"/>
</svg>`;
}

/**
 * Generate the "after" image and write it under uploadDir.
 * Returns a /uploads/... URL, or null if nothing could be produced.
 */
export async function generateAfterImage({ beforePhoto, analysis, uploadDir, fileId }) {
  // Live path: image-to-image edit of the customer's ACTUAL photo, so the roof
  // is genuinely repaired while the building, angle, colors and lighting stay
  // identical. Requires an editable source photo (png/jpeg/webp).
  if (IMAGEGEN_LIVE && beforePhoto && EDITABLE_MIMES.has(beforePhoto.mime)) {
    try {
      const outPath = path.join(uploadDir, `${fileId}-after.png`);
      await editWithOpenAI({ beforePhoto, outPath });
      return `/uploads/${fileId}-after.png`;
    } catch (err) {
      // Never surface third-party errors; fall back to the offline preview.
      console.error("[imagegen] live edit failed, using preview:", err.message);
    }
  }

  try {
    const svg = buildPreviewSvg({ beforePhoto, analysis });
    const outPath = path.join(uploadDir, `${fileId}-after.svg`);
    fs.writeFileSync(outPath, svg);
    return `/uploads/${fileId}-after.svg`;
  } catch (err) {
    console.error("[imagegen] preview generation failed:", err.message);
    return null;
  }
}
