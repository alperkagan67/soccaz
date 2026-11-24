"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "@/server/actions";

/** quiet: in der Lobby (eigene Hauptaktion, AC-30) kein oranger Knopf und keine Karte in der Karte. */
export function InviteBox({ teamId, teamName, quiet = false, kontoSatz }: { teamId: string; teamName: string; quiet?: boolean; kontoSatz?: string }) {
  const main = quiet ? "btn btn-ghost" : "btn btn-primary";
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function create() {
    setError(undefined);
    start(async () => {
      const result = await createInviteAction(teamId);
      if (result.error) return setError(result.error);
      setUrl(`${window.location.origin}/einladung/${result.token}`);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopieren nicht möglich. Bitte den Link markieren und kopieren.");
    }
  }

  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`${kontoSatz ? `${kontoSatz} ` : ""}Komm in mein Team ${teamName} auf Socaz: ${url}`)}`
    : "#";

  return (
    <div className={quiet ? "space-y-3 border-t border-line pt-2" : "card space-y-3"}>
      <h2 className="font-semibold">Spieler einladen</h2>
      {url ? (
        <>
          <input readOnly value={url} className="field text-sm" aria-label="Einladungslink" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <button onClick={copy} className="btn btn-ghost flex-1">{copied ? "Kopiert" : "Link kopieren"}</button>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${main} flex-1`}>WhatsApp</a>
          </div>
          <p className="text-xs text-muted">Der Link ist 7 Tage gültig.</p>
        </>
      ) : (
        <button onClick={create} disabled={pending} className={`${main} w-full disabled:opacity-60`}>
          {pending ? "Erstelle…" : "Einladungslink erstellen"}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
