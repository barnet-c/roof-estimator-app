// Public landing + lead capture.
import { Link } from "react-router-dom";
import { ShieldCheck, Zap, Camera, Ruler, LayoutDashboard, SlidersHorizontal, LogOut } from "lucide-react";
import EstimatorForm from "../components/EstimatorForm.jsx";
import { Card, Button } from "../components/ui.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";

const STEPS = [
  { icon: Camera, title: "Snap & upload", body: "Add 1–3 clear photos of the roof surface." },
  { icon: Zap, title: "AI vision analysis", body: "We identify roof type, damage, and remaining life." },
  { icon: Ruler, title: "Honest price band", body: "Get a transparent repair, recoat, or replace estimate." },
];

export default function Home() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Roof Estimator</span>
          </Link>
          <div className="flex items-center gap-1">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard">
                  <Button variant="ghost" size="sm">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Button>
                </Link>
                <Link to="/logistics">
                  <Button variant="ghost" size="sm">
                    <SlidersHorizontal className="h-4 w-4" /> Logistics
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="outline" size="sm">Company Portal</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 lg:py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Hero */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5" /> Instant AI estimates
            </span>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Commercial roof estimates in under a minute.
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              Upload a few photos and our AI assesses the condition, recommends the
              right action, and sends a professional price band — instantly.
            </p>
            <ul className="mt-8 space-y-4">
              {STEPS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="text-sm text-muted-foreground">{body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Form card */}
          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Start your estimate</h2>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Takes about 60 seconds.
            </p>
            <EstimatorForm />
          </Card>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-muted-foreground">
          Powered by AI roof analysis ·{" "}
          <Link to="/login" className="text-primary hover:underline">
            Company Portal
          </Link>
        </div>
      </footer>
    </div>
  );
}
