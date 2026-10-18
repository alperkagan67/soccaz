"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
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
