// Company-only editor for the formal estimate. The contractor edits the
// high-level assessment (roof type, recommendation, condition, price band,
// notes, terms); the itemized scope of work and the total are regenerated
// automatically by the server on save, so the cost always tracks the new data.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Wand2 } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { formatMoney } from "../lib/utils.js";
import { expectedLifeAfter, bandFromRates } from "../lib/estimate.js";

const ROOF_TYPES = ["TPO", "EPDM", "modified bitumen", "built-up", "metal", "clay tile", "shingle", "unknown"];
const ACTIONS = ["repair", "recoat", "replace"];
const ACTION_LABEL = { repair: "Targeted repair", recoat: "Restoration & recoating", replace: "Full replacement" };

function toForm(s) {
  return {
    roof_type: s.roof_type || "unknown",
    recommended_action: s.recommended_action || "repair",
    estimated_life_years: s.estimated_life_years ?? 10,
    expected_life_years:
      s.expected_life_years ??
      expectedLifeAfter(s.recommended_action || "repair", s.roof_type || "unknown", s.estimated_life_years ?? 10),
    visible_damage: s.visible_damage || "",
    price_band_low: s.price_band_low ?? 0,
    price_band_high: s.price_band_high ?? 0,
    valid_days: s.valid_days || 30,
    notes: s.notes || "",
    terms: s.terms || "",
  };
}

export default function EstimateEditor({ summary, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toForm(summary));
  const sqft = Number(summary.square_footage) || 0;

  // Company rates so we can auto-recompute the price band when the
  // recommendation changes. Server also enforces this on save.
  const { data: settingsData } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const settings = settingsData?.settings;

  const roofOptions = useMemo(
    () => (ROOF_TYPES.includes(form.roof_type) ? ROOF_TYPES : [form.roof_type, ...ROOF_TYPES]),
    [form.roof_type],
  );

  // The "cost estimate" the customer sees is the midpoint of the price band;
  // the server itemizes it into a professional scope of work on save.
  const projectedTotal = Math.round(((Number(form.price_band_low) || 0) + (Number(form.price_band_high) || 0)) / 2);

  const save = useMutation({
    mutationFn: (payload) => api.updateEstimation(summary.id, payload),
    onSuccess: (data) => {
      toast.success("Estimate updated — scope and total recalculated");
      onSaved(data.summary);
    },
    onError: (err) => toast.error(err.message || "Could not save the estimate"),
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Changing the roof type refreshes the suggested life after service.
  const setRoof = (e) => {
    const roof_type = e.target.value;
    setForm((f) => ({
      ...f,
      roof_type,
      expected_life_years: expectedLifeAfter(f.recommended_action, roof_type, f.estimated_life_years),
    }));
  };

  // Changing the recommendation recomputes the price band from the company's
  // configured per-sq-ft rates and refreshes the suggested life after service
  // (the contractor can still fine-tune both below).
  const setAction = (e) => {
    const recommended_action = e.target.value;
    setForm((f) => {
      const next = {
        ...f,
        recommended_action,
        expected_life_years: expectedLifeAfter(recommended_action, f.roof_type, f.estimated_life_years),
      };
      if (settings) {
        const band = bandFromRates(recommended_action, sqft, settings);
        next.price_band_low = band.price_band_low;
        next.price_band_high = band.price_band_high;
      }
      return next;
    });
  };

  function handleSubmit(e) {
    e.preventDefault();
    const low = Number(form.price_band_low);
    const high = Number(form.price_band_high);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < 0) {
      return toast.error("Price range must be non-negative numbers");
    }
    if (low > high) return toast.error("Price range low end cannot exceed the high end");
    // Note: line_items is intentionally omitted so the server regenerates the
    // itemized scope from these fields.
    save.mutate({
      roof_type: form.roof_type,
      recommended_action: form.recommended_action,
      estimated_life_years: Number(form.estimated_life_years),
      expected_life_years: Number(form.expected_life_years),
      visible_damage: form.visible_damage,
      price_band_low: low,
      price_band_high: high,
      valid_days: Number(form.valid_days),
      notes: form.notes,
      terms: form.terms,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-primary">Roof assessment</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="roof_type">Roof type</Label>
            <Select id="roof_type" className="h-10" value={form.roof_type} onChange={setRoof}>
              {roofOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="action">Recommendation</Label>
            <Select id="action" className="h-10" value={form.recommended_action} onChange={setAction}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABEL[a]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="life">Current roof — est. remaining life (years)</Label>
            <Input id="life" type="number" min="0" max="60" className="h-10" value={form.estimated_life_years} onChange={set("estimated_life_years")} />
          </div>
          <div>
            <Label htmlFor="afterlife">Life after {ACTION_LABEL[form.recommended_action].toLowerCase()} (years)</Label>
            <Input id="afterlife" type="number" min="0" max="80" className="h-10" value={form.expected_life_years} onChange={set("expected_life_years")} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="damage">Visible damage</Label>
            <Input id="damage" className="h-10" maxLength={200} placeholder="e.g. seam separation, blisters" value={form.visible_damage} onChange={set("visible_damage")} />
          </div>
          <div>
            <Label htmlFor="low">Price range low ($)</Label>
            <Input id="low" type="number" min="0" step="100" className="h-10" value={form.price_band_low} onChange={set("price_band_low")} />
          </div>
          <div>
            <Label htmlFor="high">Price range high ($)</Label>
            <Input id="high" type="number" min="0" step="100" className="h-10" value={form.price_band_high} onChange={set("price_band_high")} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="valid">Estimate valid for (days)</Label>
            <Input id="valid" type="number" min="1" max="365" className="h-10" value={form.valid_days} onChange={set("valid_days")} />
          </div>
        </div>
      </section>

      {/* Auto-computed cost preview */}
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Wand2 className="h-4 w-4" /> Cost recalculated on save
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="field-label">Projected estimate total</div>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(projectedTotal)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Midpoint of {formatMoney(form.price_band_low)}–{formatMoney(form.price_band_high)}
            </div>
          </div>
          <div>
            <div className="field-label">Expected life after {ACTION_LABEL[form.recommended_action].toLowerCase()}</div>
            <div className="text-2xl font-bold tabular-nums">~{form.expected_life_years} yrs</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              vs. ~{form.estimated_life_years} yrs on the current roof
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A professional itemized scope of work is generated automatically from the recommendation,
          roof type and price range when you save.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <Label htmlFor="notes">Notes to customer</Label>
          <Textarea id="notes" rows={3} maxLength={2000} placeholder="Access details, scheduling, exclusions..." value={form.notes} onChange={set("notes")} />
        </div>
        <div>
          <Label htmlFor="terms">Terms &amp; conditions</Label>
          <Textarea id="terms" rows={5} maxLength={2000} value={form.terms} onChange={set("terms")} />
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={save.isPending}>
          <Save className="h-4 w-4" /> {save.isPending ? "Saving..." : "Save & recalculate"}
        </Button>
      </div>
    </form>
  );
}
