// Company / contractor authentication. Two modes:
//  - Sign in: existing companies enter their email.
//  - Create account: company name, email, and a short description.
// Customers requesting an estimate never come here — they use the public form.
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { Button, Input, Label, Card, Spinner } from "../components/ui.jsx";

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";
  const [mode, setMode] = useState("signin"); // signin | signup
  const [form, setForm] = useState({ company_name: "", email: "", description: "" });
  const [busy, setBusy] = useState(false);

  function update(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({
          company_name: form.company_name.trim(),
          email: form.email.trim(),
          description: form.description.trim(),
        });
      } else {
        await login(form.email.trim());
      }
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Company Portal</span>
        </div>

        {/* Mode toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
          {[
            { id: "signin", label: "Sign in" },
            { id: "signup", label: "Create account" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={
                "rounded-lg px-3 py-2 text-sm font-medium transition " +
                (mode === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <h1 className="text-xl font-semibold">
          {mode === "signup" ? "Create your company account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "For roofing companies and contractors."
            : "Sign in to your company dashboard."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="company_name">Company name</Label>
              <Input
                id="company_name"
                required
                placeholder="Acme Roofing Co."
                value={form.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                className="h-12"
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="h-12"
            />
          </div>
          {mode === "signup" && (
            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={3}
                placeholder="What does your company do?"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <>
                {mode === "signup" ? "Create account" : "Continue"}{" "}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <Link to="/" className="mt-5 block text-center text-xs text-primary hover:underline">
          Back to home
        </Link>
      </Card>
    </div>
  );
}
