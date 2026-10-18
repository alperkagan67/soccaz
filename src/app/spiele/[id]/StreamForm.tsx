"use client";

import { ActionForm } from "@/components/ActionForm";
import { setStreamAction } from "@/server/stream-actions";

export function StreamForm({ matchId, current }: { matchId: string; current: string | null }) {
  return (
    <details className="card space-y-2">
      <summary className="cursor-pointer font-semibold">Live-Stream eintragen</summary>
      <ActionForm action={setStreamAction.bind(null, matchId)} submit="Speichern" className="mt-2 space-y-2" keepOnSuccess successText="Gespeichert. Leer lassen entfernt den Stream.">
        <label className="label" htmlFor="stream-url">Link zu Twitch, YouTube oder Kick</label>
        <input id="stream-url" name="url" type="url" defaultValue={current ?? ""} className="field" placeholder="https://twitch.tv/dein-kanal" />
      </ActionForm>
      <p className="text-xs text-muted">
        Für OBS: Füge eine Browser-Quelle mit der Adresse dieser Seite plus <code className="text-ink">/overlay/{matchId}</code> hinzu, dann siehst du den Spielstand mit durchsichtigem Hintergrund. Daten als JSON: <code className="text-ink">/api/spiele/{matchId}/live</code>.
      </p>
    </details>
  );
}
