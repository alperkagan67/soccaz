"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn btn-primary w-full", pending: pendingProp }: { children: React.ReactNode; className?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? "Bitte warten…" : children}
    </button>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="error mt-1" role="alert">{message}</p>;
}
