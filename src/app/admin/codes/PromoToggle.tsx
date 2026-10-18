"use client";

import { useState, useTransition } from "react";
import { setPromoActiveAction } from "@/server/admin-finance-actions";

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        className="btn btn-ghost !min-h-9 disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          start(async () => setError((await setPromoActiveAction(id, !active))?.error));
        }}
      >
        {active ? "Deaktivieren" : "Aktivieren"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
