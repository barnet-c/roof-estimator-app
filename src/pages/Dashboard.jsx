// Company dashboard — the landing page after sign-in. Lists incoming estimation
// requests. A request the current account hasn't opened yet shows a blue dot in
// its top-right corner; opening it (clicking the card) marks it viewed.
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Home as HomeIcon,
  SlidersHorizontal,
  Building2,
  MapPin,
  Mail,
  Ruler,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { Card, Badge, Button, Spinner } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { cn, formatMoney, formatDate, ACTION_STYLES } from "../lib/utils.js";

function LeadCard({ r, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => r.is_new && onOpen(r.id)}
      onKeyDown={(e) => e.key === "Enter" && r.is_new && onOpen(r.id)}
      className="relative block w-full cursor-pointer text-left"
    >
      {/* "New" indicator */}
      {r.is_new && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-background bg-blue-500" />
        </span>
      )}
      <Card className={cn("p-5 transition hover:shadow-md", r.is_new && "ring-1 ring-blue-500/40")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{r.company_name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {r.email}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.zip_code}</span>
              <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {Number(r.square_footage).toLocaleString()} sq ft</span>
            </div>
          </div>
          <Badge className={cn(ACTION_STYLES[r.recommended_action])}>{r.recommended_action}</Badge>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">
            <span className="field-label">Price band</span>
            <div className="font-semibold">{formatMoney(r.price_band_low)} – {formatMoney(r.price_band_high)}</div>
          </div>
          <div className="text-xs text-muted-foreground">{formatDate(r.created_date)}</div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <div className="field-label">Roof</div>
            <div className="capitalize">{r.roof_type}</div>
          </div>
          <div>
            <div className="field-label">Damage</div>
            <div className="truncate" title={r.visible_damage}>{r.visible_damage || "—"}</div>
          </div>
          <div>
            <div className="field-label">Est. life</div>
            <div>{r.estimated_life_years} yrs</div>
          </div>
        </div>

        {r.photo_urls?.length > 0 && (
          <div className="mt-4 flex gap-2">
            {r.photo_urls.map((url) => (
              <img key={url} src={url} alt="" className="h-14 w-14 rounded-lg border border-border object-cover" />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            {r.status === "sent" || !r.status ? (
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">Sent</Badge>
            ) : (
              <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">Draft · not sent</Badge>
            )}
            {r.estimate_edited_at && <span>Edited {formatDate(r.estimate_edited_at)}</span>}
          </span>
          <Link
            to={`/confirmation/${r.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {r.status === "draft" ? "Review & send" : "Open estimate"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: api.listLeads });
  const items = data?.items || [];
  const newCount = items.filter((r) => r.is_new).length;

  const markViewed = useMutation({
    mutationFn: (id) => api.markViewed(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Dashboard</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/"><Button variant="ghost" size="sm"><HomeIcon className="h-4 w-4" /> Home</Button></Link>
            <Link to="/logistics"><Button variant="ghost" size="sm"><SlidersHorizontal className="h-4 w-4" /> Logistics</Button></Link>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user?.company_name || "Your company"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {newCount > 0 ? `${newCount} new request${newCount === 1 ? "" : "s"}` : "You're all caught up"}
          </p>
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Estimation requests</h2>
          <span className="text-sm text-muted-foreground">{items.length} total</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-primary" /></div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No estimation requests yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {items.map((r) => <LeadCard key={r.id} r={r} onOpen={markViewed.mutate} />)}
          </div>
        )}
      </main>
    </div>
  );
}
