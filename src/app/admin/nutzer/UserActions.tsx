"use client";

import { useState, useTransition } from "react";
import { setBannedAction, setProBadgeAction, setRoleAction } from "@/server/admin-actions";
import { ALL_ROLES, ROLE_LABEL, type Role } from "@/lib/roles";

type Result = { error?: string } | undefined;

export function UserActions({ userId, role, banned, pro, isSelf }: { userId: string; role: Role; banned: boolean; pro: boolean; isSelf: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) => {
    setError(undefined);
    start(async () => setError((await fn())?.error));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="sr-only" htmlFor={`role-${userId}`}>Rolle</label>
      <select
        id={`role-${userId}`}
        className="field !min-h-9 !w-auto"
        defaultValue={role}
        disabled={pending || isSelf}
        onChange={(e) => run(() => setRoleAction(userId, e.target.value))}
      >
        {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <button className="btn btn-ghost !min-h-9" disabled={pending} onClick={() => run(() => setProBadgeAction(userId, !pro))}>
        {pro ? "Profi-Badge entziehen" : "Profi-Badge geben"}
      </button>
      {!isSelf && (
        <button
          className={`btn !min-h-9 ${banned ? "btn-ghost" : "btn-danger"}`}
          disabled={pending}
          onClick={() => {
            if (banned) return run(() => setBannedAction(userId, false, ""));
            const reason = prompt("Grund für die Sperre (wird protokolliert):");
            if (reason) run(() => setBannedAction(userId, true, reason));
          }}
        >
          {banned ? "Entsperren" : "Sperren"}
        </button>
      )}
      {error && <p className="error w-full" role="alert">{error}</p>}
    </div>
  );
}
