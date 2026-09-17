// Confirmation ("done") page.
//
// Three views of the same estimate:
//  - Customer, draft:  "request received, being reviewed" stub (no pricing).
//    Polls so the estimate appears as soon as the company sends it.
//  - Company (owner):  full estimate + Edit / Send to customer / Generate PDF.
//  - Customer, sent:   full estimate + Generate PDF.
import { useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Mail,
  CalendarCheck,
  FileDown,
  PencilLine,
  X,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import BeforeAfter from "../components/BeforeAfter.jsx";
import EstimateEditor from "../components/EstimateEditor.jsx";
import { Card, Button, PageSpinner, Badge } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { cn, formatDate, ACTION_STYLES } from "../lib/utils.js";

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <div className="field-label">{label}</div>
      <div className="mt-0.5 font-semibold capitalize text-foreground">{value}</div>
    </div>
  );
}

function money2(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PendingView({ summary }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center px-4 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Clock className="h-9 w-9 text-primary" />
      </div>
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight">Your request has been received</h1>
      <p className="mt-2 text-center text-muted-foreground">
        Thank you! <span className="font-medium text-foreground">{summary.company_name}</span> has received your
        roof photos and is preparing your estimate.
      </p>
      <Card className="mt-6 w-full p-6">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <Mail className="mt-0.5 h-4 w-4 flex-none text-primary" />
          <span>
            We&apos;ll email your completed estimate to{" "}
            <span className="font-medium">{summary.email}</span> as soon as it&apos;s ready.
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Reference {summary.estimate_number}</span>
          <span>Submitted {formatDate(summary.created_date)}</span>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          You can safely close this page — your estimate will arrive in your inbox. This page also updates
          automatically once it&apos;s ready.
        </p>
      </Card>
      <Link to="/" className="mt-6 text-sm text-primary hover:underline">
        Submit another estimate
      </Link>
    </div>
  );
}

export default function Confirmation() {
  const { id } = useParams();
  const location = useLocation();
  const qc = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const queryKey = ["estimation", id];
  const { data: summary, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.getEstimation(id).then((d) => d.summary),
    initialData: location.state?.summary?.id === id ? location.state.summary : undefined,
    // While the customer is waiting on a draft, poll for the release.
    refetchInterval: (query) => (query.state.data?.pending ? 15000 : false),
  });

  const send = useMutation({
    mutationFn: () => api.sendEstimate(id),
    onSuccess: (data) => {
      qc.setQueryData(queryKey, data.summary);
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        data.email_delivered
          ? `Estimate emailed to ${data.summary.email}`
          : `Estimate released to the customer${data.email_enabled ? "" : " (email delivery is not configured yet)"}`,
      );
    },
    onError: (err) => toast.error(err.message || "Could not send the estimate"),
  });

  async function handlePdf() {
    setDownloading(true);
    try {
      const { blob, filename } = await api.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast.error(err.message || "Could not generate the PDF");
    } finally {
      setDownloading(false);
    }
  }

  function handleSend() {
    if (!window.confirm(`Send this estimate to ${summary.email}? The customer will be able to see pricing and download the PDF.`)) return;
    send.mutate();
  }

  if (isLoading || authLoading) return <PageSpinner />;

  if (isError || !summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-muted-foreground">We couldn't load this estimate.</p>
        <Link to="/">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    );
  }

  if (summary.pending) return <PendingView summary={summary} />;

  const canEdit = !!user && (summary.company_id === user.id || summary.created_by_id === user.id);
  const isDraft = summary.status !== "sent";
  const items = summary.line_items || [];
  const total = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center px-4 py-12">
      <div className={cn("flex h-16 w-16 items-center justify-center rounded-2xl", isDraft ? "bg-amber-500/15" : "bg-emerald-500/15")}>
        {isDraft ? <ShieldAlert className="h-9 w-9 text-amber-400" /> : <CheckCircle2 className="h-9 w-9 text-emerald-400" />}
      </div>
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight">
        {canEdit ? (isDraft ? "Draft estimate — review before sending" : "Estimate sent") : "Your estimate is ready"}
      </h1>
      <p className="mt-2 text-center text-muted-foreground">
        {canEdit
          ? isDraft
            ? `The customer has not seen this yet. Adjust pricing or scope, then send it to ${summary.email}.`
            : `Sent to ${summary.email} on ${formatDate(summary.sent_at)}. You can still edit and resend.`
          : "Your contractor has reviewed the assessment and prepared your estimate."}
      </p>

      <BeforeAfter
        beforeUrl={summary.before_image_url}
        afterUrl={summary.after_image_url}
        action={summary.recommended_action}
      />

      {/* Actions */}
      <div className="mt-6 flex w-full flex-wrap gap-3">
        {canEdit && (
          <Button size="lg" variant={isDraft ? "outline" : "outline"} className="flex-1" onClick={() => setEditing((v) => !v)}>
            {editing ? (
              <>
                <X className="h-5 w-5" /> Close editor
              </>
            ) : (
              <>
                <PencilLine className="h-5 w-5" /> Edit estimate
              </>
            )}
          </Button>
        )}
        <Button size="lg" variant={canEdit && isDraft ? "outline" : "primary"} className="flex-1" onClick={handlePdf} disabled={downloading}>
          <FileDown className="h-5 w-5" /> {downloading ? "Generating..." : "Generate PDF"}
        </Button>
        {canEdit && (
          <Button size="lg" className="flex-1 basis-full sm:basis-auto" onClick={handleSend} disabled={send.isPending || editing}>
            <Send className="h-5 w-5" />
            {send.isPending ? "Sending..." : isDraft ? "Send to customer" : "Resend to customer"}
          </Button>
        )}
      </div>
      {canEdit && editing && (
        <p className="mt-2 text-xs text-muted-foreground">Save or cancel your edits before sending.</p>
      )}

      {editing && canEdit && (
        <Card className="mt-4 w-full p-6">
          <EstimateEditor
            summary={summary}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              qc.setQueryData(queryKey, next);
              qc.invalidateQueries({ queryKey: ["leads"] });
              setEditing(false);
            }}
          />
        </Card>
      )}

      {summary.overview && (
        <Card className="mt-4 w-full p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> What we found &amp; how we&apos;ll fix it
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
            {summary.overview.split("\n\n").map((para, i) => (
              <p key={i} className="whitespace-pre-line">{para}</p>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4 w-full p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4" /> {isDraft ? "Customer" : "Sent to"}{" "}
            <span className="font-medium text-foreground">{summary.email}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Badge className={isDraft ? "border-amber-500/30 bg-amber-500/15 text-amber-300" : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"}>
              {isDraft ? "Draft" : "Sent"}
            </Badge>
            <span className="font-mono text-xs">{summary.estimate_number}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Roof type" value={summary.roof_type_label || summary.roof_type} />
          <Stat label="Recommendation" value={summary.action_label || summary.recommended_action} />
          <Stat label="Current roof — life left" value={`~${summary.estimated_life_years} yrs`} />
          <Stat
            label={`Life after ${(summary.action_label || "service").toLowerCase()}`}
            value={`~${summary.expected_life_years ?? summary.estimated_life_years} yrs`}
          />
        </div>
        {summary.roof_type_blurb && (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">What this means:</span> {summary.roof_type_blurb}.
          </p>
        )}

        {items.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="field-label">Scope of work</div>
              {summary.estimate_edited_at && (
                <Badge className="border-primary/30 bg-primary/10 text-primary">
                  Edited {formatDate(summary.estimate_edited_at)}
                </Badge>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              {items.map((it, i) => (
                <div key={i} className={cn("flex items-start justify-between gap-3 px-3 py-2 text-sm", i > 0 && "border-t border-border")}>
                  <div>
                    <div className="font-medium">{it.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {Number(it.quantity).toLocaleString("en-US")} {it.unit} × {money2(it.unit_price)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">
                    {money2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border bg-accent px-3 py-2.5">
                <span className="text-sm font-semibold">Estimated total</span>
                <span className="text-base font-bold text-accent-foreground tabular-nums">{money2(total)}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Valid for {summary.valid_days} days</span>
              <Badge className={cn(ACTION_STYLES[summary.recommended_action])}>{summary.recommended_action}</Badge>
            </div>
          </div>
        )}

        {summary.notes && (
          <div className="mt-4">
            <div className="field-label">Notes</div>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">{summary.notes}</p>
          </div>
        )}

        {summary.booking_link ? (
          <a href={summary.booking_link} target="_blank" rel="noreferrer" className="mt-5 block">
            <Button size="lg" variant="outline" className="w-full">
              <CalendarCheck className="h-5 w-5" /> Book free on-site inspection
            </Button>
          </a>
        ) : (
          <Button size="lg" variant="outline" className="mt-5 w-full" disabled>
            <CalendarCheck className="h-5 w-5" /> Booking link not configured
          </Button>
        )}
      </Card>

      <Link to={canEdit ? "/dashboard" : "/"} className="mt-6 text-sm text-primary hover:underline">
        {canEdit ? "Back to dashboard" : "Submit another estimate"}
      </Link>
    </div>
  );
}
