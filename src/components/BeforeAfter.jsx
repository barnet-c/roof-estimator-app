// Side-by-side before/after visualization. Renders only when both images exist.
// The "after" is an AI edit of the customer's own photo (same building, angle
// and lighting, roof repaired), so both panels share a landscape aspect and are
// cropped identically to keep them directly comparable.
import { Sparkles } from "lucide-react";

export default function BeforeAfter({ beforeUrl, afterUrl, action }) {
  if (!beforeUrl || !afterUrl) return null;
  return (
    <div className="mt-6 w-full">
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" />
        See the {action} result
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { label: "Before", url: beforeUrl, ring: "border-rose-500/30" },
          { label: "After", url: afterUrl, ring: "border-primary/50" },
        ].map((panel) => (
          <div key={panel.label}>
            <div className={`aspect-[3/2] overflow-hidden rounded-2xl border ${panel.ring} bg-black/40`}>
              <img
                src={panel.url}
                alt={`${panel.label} roof`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="mt-1.5 text-center text-xs font-medium text-muted-foreground">
              {panel.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        AI-generated visualization from your photo. Actual results may vary.
      </p>
    </div>
  );
}
