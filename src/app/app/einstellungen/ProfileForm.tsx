"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { deleteAccountAction, updateProfileAction } from "@/server/account-actions";

const POSITIONS = ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"];

export function ProfileForm({ name, city, position, profilePublic, bio }: { name: string; city: string | null; position: string | null; profilePublic: boolean; bio: string | null }) {
  const { state, pending, onSubmit } = useFormAction(updateProfileAction);
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" defaultValue={name} required minLength={2} maxLength={60} className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={city ?? CITIES[0]} className="field">
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="position">Position</label>
          <select id="position" name="position" defaultValue={position ?? "Flexibel"} className="field">
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio">Steckbrief (optional)</label>
        <textarea id="bio" name="bio" rows={3} maxLength={280} defaultValue={bio ?? ""} className="field" placeholder="z. B. Spiele seit 10 Jahren Hallenfußball, am liebsten im Sturm." />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="profilePublic" defaultChecked={profilePublic} className="mt-1" />
        <span>
          Öffentliches Profil
          <span className="block text-xs text-muted">Andere sehen Name, Statistik, Abzeichen und Teams. Dein Geburtsdatum und deine E-Mail sieht niemand.</span>
        </span>
      </label>
      <SubmitButton pending={pending}>Profil speichern</SubmitButton>
      {state?.error && <FieldError message={state.error} />}
      {state?.ok && <p className="text-sm text-green" role="status">Gespeichert.</p>}
    </form>
  );
}

export function DeleteAccountForm() {
  const { state, pending, onSubmit } = useFormAction(deleteAccountAction);
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <p className="text-sm text-muted">
        Beim Löschen entfernen wir deine persönlichen Daten, Kommentare, Abzeichen und Statistik. Gespielte Spiele und Buchungen bleiben ohne deinen Namen erhalten. Das lässt sich nicht rückgängig machen.
      </p>
      <div>
        <label className="label" htmlFor="confirm">Tippe LÖSCHEN zur Bestätigung</label>
        <input id="confirm" name="confirm" autoComplete="off" className="field" />
      </div>
      <SubmitButton pending={pending} className="btn btn-danger w-full">
        Konto endgültig löschen
      </SubmitButton>
      {state?.error && <FieldError message={state.error} />}
    </form>
  );
}
