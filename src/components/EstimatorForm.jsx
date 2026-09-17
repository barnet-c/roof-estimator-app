// The customer lead-capture form. The customer enters their ZIP + contact email,
// picks a registered roofing company from a dropdown, and we verify that company
// serves their ZIP before letting them submit. Then square footage + photos.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Mail, Ruler, MapPin, ArrowRight, AlertTriangle } from "lucide-react";
import PhotoDropzone from "./PhotoDropzone.jsx";
import { Button, Input, Select, Label, Spinner } from "./ui.jsx";
import { api } from "../lib/api.js";

export default function EstimatorForm() {
  const navigate = useNavigate();
  const { data: companiesData, isLoading: loadingCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: api.listCompanies,
  });
  const companies = companiesData?.items || [];

  const [form, setForm] = useState({ zip_code: "", email: "", company_id: "", square_footage: "" });
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function update(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  const selected = companies.find((c) => c.id === form.company_id) || null;
  const zip = form.zip_code.trim();
  const zipValid = /^\d{5}$/.test(zip);

  // Coverage check: only meaningful once a company is picked, the ZIP is valid,
  // and that company has declared a service area.
  const coverageError =
    selected && zipValid && selected.service_zips.length > 0 && !selected.service_zips.includes(zip)
      ? `${selected.company_name} does not serve ZIP ${zip}`
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!zipValid) {
      toast.error("Enter a valid 5-digit ZIP code.");
      return;
    }
    if (!form.email || !form.company_id || !form.square_footage) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (coverageError) {
      toast.error(coverageError);
      return;
    }
    if (photos.length === 0) {
      toast.error("Add at least one roof photo.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.processEstimation({
        company_id: form.company_id,
        email: form.email,
        zip_code: zip,
        square_footage: Number(form.square_footage),
        photos,
      });
      navigate(`/confirmation/${res.id}`, { state: { summary: res.summary } });
    } catch (err) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ZIP code */}
        <div>
          <Label htmlFor="zip_code">ZIP code</Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="zip_code"
              inputMode="numeric"
              placeholder="60601"
              value={form.zip_code}
              onChange={(e) => update("zip_code", e.target.value)}
              className="h-12 pl-9"
            />
          </div>
        </div>

        {/* Contact email */}
        <div>
          <Label htmlFor="email">Contact email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="h-12 pl-9"
            />
          </div>
        </div>

        {/* Company dropdown */}
        <div>
          <Label htmlFor="company_id">Roofing company</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Select
              id="company_id"
              value={form.company_id}
              onChange={(e) => update("company_id", e.target.value)}
              className="h-12 pl-9"
              disabled={loadingCompanies || companies.length === 0}
            >
              <option value="" disabled>
                {loadingCompanies
                  ? "Loading companies…"
                  : companies.length === 0
                    ? "No companies available yet"
                    : "Select a company"}
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Square footage */}
        <div>
          <Label htmlFor="square_footage">Building sq ft</Label>
          <div className="relative">
            <Ruler className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="square_footage"
              inputMode="numeric"
              placeholder="25000"
              value={form.square_footage}
              onChange={(e) => update("square_footage", e.target.value)}
              className="h-12 pl-9"
            />
          </div>
        </div>
      </div>

      {/* Coverage warning */}
      {coverageError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{coverageError}. Please choose a different company or check your ZIP.</span>
        </div>
      )}

      <div>
        <Label>Roof photos</Label>
        <PhotoDropzone photos={photos} onChange={setPhotos} />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting || !!coverageError}>
        {submitting ? (
          <>
            <Spinner className="h-5 w-5" /> Analyzing your roof…
          </>
        ) : (
          <>
            Get my instant estimate <ArrowRight className="h-5 w-5" />
          </>
        )}
      </Button>
    </form>
  );
}
