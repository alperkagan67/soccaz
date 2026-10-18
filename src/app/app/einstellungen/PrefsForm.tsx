"use client";

import { useActionState } from "react";
import { savePrefsAction } from "@/server/actions";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import { SubmitButton } from "@/components/FormBits";

export function PrefsForm({ push, email, disabledTypes }: { push: boolean; email: boolean; disabledTypes: string[] }) {
  const [state, action, pending] = useActionState(savePrefsAction, undefined);
  const optional = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter((t) => NOTIFICATION_TYPES[t].optional);

  return (
    <form action={action} className="card space-y-4">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Kanäle</legend>
        <label className="flex items-center gap-3"><input type="checkbox" name="push" defaultChecked={push} className="size-5 accent-green" /> Push-Nachrichten auf meinen Geräten</label>
        <label className="flex items-center gap-3"><input type="checkbox" name="email" defaultChecked={email} className="size-5 accent-green" /> E-Mail bei wichtigen Ereignissen</label>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Das möchte ich erfahren</legend>
        {optional.map((t) => (
          <label key={t} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name={`type:${t}`} defaultChecked={!disabledTypes.includes(t)} className="size-5 accent-green" />
            {NOTIFICATION_TYPES[t].label}
          </label>
        ))}
        <p className="text-xs text-muted">Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer.</p>
      </fieldset>
      <SubmitButton>Speichern</SubmitButton>
      {!pending && state && !state.error && <p className="text-sm text-green" role="status">Gespeichert.</p>}
    </form>
  );
}
