// Company logistics — pricing, service area, and notification settings. Shared
// across all accounts of the business (single-inbox model).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Home as HomeIcon, LayoutDashboard } from "lucide-react";
import { Card, Button, Input, Select, Label, Spinner } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const PRICING = [
  { action: "Repair", low: "repair_low", high: "repair_high" },
  { action: "Recoat", low: "recoat_low", high: "recoat_high" },
  { action: "Replace", low: "replace_low", high: "replace_high" },
];

const NOTIFY_FIELDS = [
  { name: "contractor_email", label: "Lead notification email", type: "email", placeholder: "leads@yourco.com" },
  { name: "resend_from_email", label: "Resend from email", type: "email", placeholder: "estimates@yourco.com" },
  { name: "cc_email", label: "CC email", type: "email", placeholder: "sales@yourco.com" },
  { name: "reply_to_email", label: "Reply-to email", type: "email", placeholder: "reply@yourco.com" },
  { name: "booking_link", label: "Booking link", type: "url", placeholder: "https://calendly.com/…" },
];

export default function Logistics() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: accountData } = useQuery({ queryKey: ["account"], queryFn: api.me });
  const [form, setForm] = useState(null);
  const [zipsText, setZipsText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  useEffect(() => {
    const zips = accountData?.user?.service_zips;
    if (Array.isArray(zips)) setZipsText(zips.join(", "));
  }, [accountData]);

  function update(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveSettings(form);
      await api.saveAccount({ service_zips: zipsText });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Logistics saved.");
    } catch (err) {
      toast.error(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Company logistics</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/"><Button variant="ghost" size="sm"><HomeIcon className="h-4 w-4" /> Home</Button></Link>
            <Link to="/dashboard"><Button variant="ghost" size="sm"><LayoutDashboard className="h-4 w-4" /> Dashboard</Button></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {isLoading || !form ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-primary" /></div>
        ) : (
          <>
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Pricing rules ($/sqft)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your price range per action. These drive the estimate band customers see.
              </p>
              <div className="mt-5 grid grid-cols-3 items-center gap-3">
                <div className="field-label">Action</div>
                <div className="field-label">Low</div>
                <div className="field-label">High</div>
                {PRICING.map(({ action, low, high }) => (
                  <div key={action} className="contents">
                    <div className="font-medium">{action}</div>
                    <Input
                      className="h-11"
                      type="number"
                      step="0.5"
                      value={form[low]}
                      onChange={(e) => update(low, e.target.value)}
                    />
                    <Input
                      className="h-11"
                      type="number"
                      step="0.5"
                      value={form[high]}
                      onChange={(e) => update(high, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold">Service area</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The 5-digit ZIP codes your company serves. Customers can only request an
                estimate from you if their ZIP is listed here. Leave empty to serve everywhere.
              </p>
              <div className="mt-4">
                <Label>Served ZIP codes</Label>
                <textarea
                  rows={3}
                  className="flex w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="60601, 60602, 60603"
                  value={zipsText}
                  onChange={(e) => setZipsText(e.target.value)}
                />
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold">Notifications & booking</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Email provider</Label>
                  <Select
                    className="h-11"
                    value={form.email_provider}
                    onChange={(e) => update("email_provider", e.target.value)}
                  >
                    <option value="base44">Default email</option>
                    <option value="resend">Resend</option>
                  </Select>
                </div>
                {NOTIFY_FIELDS.map(({ name, label, type, placeholder }) => (
                  <div key={name}>
                    <Label>{label}</Label>
                    <Input
                      className="h-11"
                      type={type}
                      placeholder={placeholder}
                      value={form[name] || ""}
                      onChange={(e) => update(name, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Email sending is currently disabled and can be switched on later.
              </p>
            </Card>

            <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner className="h-5 w-5" /> Saving…</> : "Save logistics"}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
