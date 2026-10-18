"use client";

import { useState, useTransition } from "react";
import { cancelRequestAction } from "@/server/actions";

export function CancelButton({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        className="btn btn-danger w-full disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          if (!confirm("Spielsuche wirklich zurückziehen?")) return;
          start(async () => setError((await cancelRequestAction(requestId))?.error));
        }}
      >
        {pending ? "Bitte warten…" : "Spielsuche zurückziehen"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
