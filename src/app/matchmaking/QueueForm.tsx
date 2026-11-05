"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { STRENGTH_LABELS } from "@/lib/labels";
import { CITIES } from "@/lib/validation";
import { joinQueueAction } from "@/server/matchmaking-actions";

export function QueueForm({ teams, minDay }: { teams: { id: string; name: string; city: string }[]; minDay: string }) {
  const [windows, setWindows] = useState(1);
  return (
    <ActionForm action={joinQueueAction} submit="Lobby aufmachen" successText="Eure Lobby ist offen. Sobald ein Team antritt, melden wir uns.">
      <h2 className="font-semibold">Neue Lobby für dein Team</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="q-team">Team</label>
          <select id="q-team" name="teamId" className="field">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q-city">Stadt</label>
          <select id="q-city" name="city" defaultValue={teams[0]?.city} className="field">
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q-dur">Dauer</label>
          <select id="q-dur" name="durationMin" defaultValue="60" className="field">
            <option value="60">60 Min</option>
            <option value="90">90 Min</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="q-wmin">Gesuchte Stärke des Gegners von</label>
          <select id="q-wmin" name="wantMin" defaultValue="" className="field">
            <option value="">egal</option>
            {Object.entries(STRENGTH_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{v} – {l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q-wmax">bis</label>
          <select id="q-wmax" name="wantMax" defaultValue="" className="field">
            <option value="">egal</option>
            {Object.entries(STRENGTH_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{v} – {l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="q-note">Hinweis für andere Teams (optional)</label>
        <input id="q-note" name="note" maxLength={200} className="field" placeholder="z. B. Mixed-Team, wir spielen locker, Revanche erwünscht" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Wann wollt ihr spielen?</h3>
        <p className="text-sm text-muted" data-testid="windows-hint">Wähle den Tag und von wann bis wann euer Team Zeit hat. Wenn ein Team antritt, einigen sich die Captains auf die genaue Uhrzeit in diesem Zeitraum.</p>
      </div>
      {[1, 2, 3].filter((i) => i <= windows).map((i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <div>
            <label className="label" htmlFor={`q-day${i}`}>{i === 1 ? "Tag des Spiels" : `Alternativer Tag ${i - 1}`}</label>
            <input id={`q-day${i}`} name={`day${i}`} type="date" min={minDay} className="field" required={i === 1} />
          </div>
          <div>
            <label className="label" htmlFor={`q-from${i}`}>Von</label>
            <input id={`q-from${i}`} name={`from${i}`} type="time" step={900} className="field" required={i === 1} />
          </div>
          <div>
            <label className="label" htmlFor={`q-to${i}`}>Bis</label>
            <input id={`q-to${i}`} name={`to${i}`} type="time" step={900} className="field" required={i === 1} />
          </div>
        </div>
      ))}
      {windows < 3 && (
        <button type="button" className="text-sm text-green underline" onClick={() => setWindows((w) => Math.min(w + 1, 3))}>
          + Alternativen Tag anbieten (falls ihr an mehreren Tagen könnt)
        </button>
      )}
    </ActionForm>
  );
}
