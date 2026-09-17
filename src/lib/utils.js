// Small utilities.

// Merge class names, dropping falsy values.
export function cn(...args) {
  return args.filter(Boolean).join(" ");
}

export function formatMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "$0";
  return `$${Math.round(num).toLocaleString("en-US")}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export const ACTION_STYLES = {
  repair: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  recoat: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  replace: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
