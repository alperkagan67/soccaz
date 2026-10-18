"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { closePostAction, createPostAction, requestPlayerAction } from "@/server/freeplayers-actions";

export function PostForm({ defaultCity, min }: { defaultCity: string | null; min: string }) {
  const { state, pending, onSubmit } = useFormAction(createPostAction);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Ich suche ein Spiel</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="day">Tag</label>
          <input id="day" name="day" type="date" min={min} required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={defaultCity ?? CITIES[0]} className="field">
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Hinweis (optional)</label>
        <input id="note" name="note" maxLength={200} className="field" placeholder="z. B. ab 19 Uhr, spiele im Tor" />
      </div>
      <SubmitButton pending={pending}>Eintragen</SubmitButton>
      {state?.error && <FieldError message={state.error} />}
    </form>
  );
}

export function ClosePostButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-muted underline" disabled={pending} onClick={() => start(async () => void (await closePostAction(id)))}>
      Zurückziehen
    </button>
  );
}

export function RequestPlayerButton({ postId, teams }: { postId: string; teams: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [message, setMessage] = useState<string>();
  const [sent, setSent] = useState(false);
  if (sent) return <span className="text-xs text-green">Anfrage gesendet.</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {teams.length > 1 && (
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Mit welchem Team?" className="field !min-h-8 !w-auto !py-1 text-xs">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      <button
        className="btn btn-ghost !min-h-8 !px-3 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestPlayerAction(postId, teamId);
            if (r?.ok) setSent(true);
            else setMessage(r?.error);
          })
        }
      >
        Anfragen
      </button>
      {message && <span className="error text-xs">{message}</span>}
    </span>
  );
}
