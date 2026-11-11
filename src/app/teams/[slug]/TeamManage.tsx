"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { TEAM_COLORS, textOn } from "@/lib/color";
import { effectiveColorKey } from "@/lib/team-color";
import { CITIES } from "@/lib/validation";
import { STRENGTH_LABELS } from "@/lib/labels";
import { dissolveTeamAction, leaveTeamAction, removeMemberAction, revokeInvitesAction, setMemberRoleAction, setTeamColorAction, updateTeamAction } from "@/server/team-admin-actions";

/** Teamfarbe wählen: genau die 12 Palettenfarben (kein Orange, keine freie Eingabe). Nur für Team-Admins eingebunden; der Server prüft Rolle und Wert erneut. */
export function TeamColorPicker({ teamId, slug, color }: { teamId: string; slug: string; color: string | null }) {
  const [current, setCurrent] = useState(effectiveColorKey(color, slug));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <fieldset className="space-y-2" data-testid="team-color-picker" disabled={pending}>
      <legend className="label">Teamfarbe</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Teamfarbe">
        {TEAM_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={current === c.key}
            aria-label={c.name}
            title={c.name}
            data-testid={`team-color-${c.key}`}
            className={`flex size-11 items-center justify-center rounded-full border-2 text-sm font-bold ${current === c.key ? "border-ink" : "border-line"}`}
            style={{ backgroundColor: c.hex, color: textOn(c.hex) }}
            onClick={() => {
              setError(undefined);
              start(async () => {
                const r = await setTeamColorAction(teamId, c.key);
                if (r?.error) setError(r.error);
                else setCurrent(c.key);
              });
            }}
          >
            {current === c.key ? "✓" : ""}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Gewählt: {TEAM_COLORS.find((c) => c.key === current)?.name}. {color ? "" : "Das ist die Standardfarbe, bis ihr eine wählt."}</p>
      {error && <p className="error text-xs" role="alert">{error}</p>}
    </fieldset>
  );
}

/** Verwaltung für Team-Admins: bearbeiten, Einladungen widerrufen, auflösen. */
export function TeamSettings({ teamId, slug, color, name, city, strength, bio }: { teamId: string; slug: string; color: string | null; name: string; city: string; strength: number; bio: string | null }) {
  return (
    <details className="card space-y-3" data-testid="team-settings">
      <summary className="cursor-pointer font-semibold">Team verwalten</summary>
      <TeamColorPicker teamId={teamId} slug={slug} color={color} />
      <ActionForm action={updateTeamAction.bind(null, teamId)} submit="Änderungen speichern" className="mt-3 space-y-3" keepOnSuccess>
        <div>
          <label className="label" htmlFor="tm-name">Teamname</label>
          <input id="tm-name" name="name" defaultValue={name} minLength={3} maxLength={40} required className="field" />
          <p className="mt-1 text-xs text-muted">Die Adresse der Teamseite bleibt gleich.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tm-city">Stadt</label>
            <select id="tm-city" name="city" defaultValue={city} className="field">
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tm-strength">Spielstärke</label>
            <select id="tm-strength" name="strength" defaultValue={String(strength)} className="field">
              {Object.entries(STRENGTH_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{v} – {l}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tm-bio">Über uns (optional)</label>
          <textarea id="tm-bio" name="bio" rows={3} maxLength={280} defaultValue={bio ?? ""} className="field" placeholder="Wer wir sind, wann wir spielen, was wir suchen." />
        </div>
      </ActionForm>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <ActionButton action={revokeInvitesAction.bind(null, teamId)} label="Alle Einladungslinks widerrufen" confirm="Alle bisherigen Einladungslinks ungültig machen?" />
        <ActionButton action={dissolveTeamAction.bind(null, teamId)} label="Team auflösen" thenGo="/app" confirm="Team wirklich auflösen? Offene Spielsuchen enden. Statistik und Spielhistorie bleiben erhalten." className="btn btn-danger !min-h-9 !px-3 text-xs" />
      </div>
    </details>
  );
}

export function MemberControls({ teamId, userId, isAdmin, isSelf }: { teamId: string; userId: string; isAdmin: boolean; isSelf: boolean }) {
  if (isSelf) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ActionButton action={setMemberRoleAction.bind(null, teamId, userId, isAdmin ? "player" : "admin")} label={isAdmin ? "Admin entziehen" : "Zum Admin machen"} />
      {!isAdmin && <ActionButton action={removeMemberAction.bind(null, teamId, userId)} label="Entfernen" confirm="Spieler aus dem Team entfernen?" />}
    </span>
  );
}

export function LeaveTeam({ teamId }: { teamId: string }) {
  return <ActionButton action={leaveTeamAction.bind(null, teamId)} label="Team verlassen" thenGo="/app" confirm="Team wirklich verlassen?" />;
}
