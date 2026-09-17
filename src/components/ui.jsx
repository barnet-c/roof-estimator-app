// Minimal styled UI primitives (button, input, card, label, badge, spinner).
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils.js";

export function Button({ className, variant = "primary", size = "md", ...props }) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-card hover:bg-secondary text-foreground",
    ghost: "hover:bg-secondary text-foreground",
  };
  const sizes = {
    md: "h-10 px-4 text-sm",
    lg: "h-14 px-6 text-base",
    sm: "h-9 px-3 text-sm",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, children, ...props }) {
  return (
    <label className={cn("field-label block mb-1.5", className)} {...props}>
      {children}
    </label>
  );
}

export function Badge({ className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn("animate-spin", className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  );
}
