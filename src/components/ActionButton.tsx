"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/validation";

/** Einzelner Knopf für eine Server-Aktion ohne Formularfelder, optional mit Rückfrage. */
export function ActionButton({ action, label, className = "btn btn-ghost !min-h-9 !px-3 text-xs", confirm, thenGo }: { action: () => Promise<ActionState>; label: string; className?: string; confirm?: string; thenGo?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(undefined);
          start(async () => {
            const r = await action();
            setError(r?.error);
            if (r?.ok && thenGo) window.location.assign(thenGo); // harte Navigation: die Zielseite ist garantiert frisch
          });
        }}
      >
        {pending ? "Bitte warten…" : label}
      </button>
      {error && (
        <span className="error text-xs" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
