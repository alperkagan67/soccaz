// Turnier 12.12.: Betriebsart TURNIER_ONLY. Ausdrückliches Opt-in (Umgebungsvariable TURNIER_ONLY=1), Standard AUS überall (auch in Produktion, auch in der CI).
// Eine Quelle für "welche Pfade sind gesperrt": Navigation, Seitensperre (layout), Live-Kanäle, sitemap und Prüfskripte lesen diese Liste. Offen bleiben Turniere, Teams, Profil, Anmeldung, Hilfe, Rechtliches, Einladungen zu Team/Turnier und die Admin-Bereiche (Plattform-Admin darf alles).
// Server-Aktionen der gesperrten Module prüfen unabhängig davon (src/server/turnier-only.ts): die Oberfläche allein ist kein Schutz.

/** Sync-Variante für Stellen, die den Nutzer schon haben (Navigation, Fußzeile): Betriebsart an und kein Plattform-Admin. */
import { isPlatformAdmin, type Role } from "./roles";

export const gesperrtFuerNutzer = (user: { role?: string | null } | null | undefined, env: Record<string, string | undefined> = process.env): boolean => turnierOnlyOn(env) && !isPlatformAdmin(user as { role?: Role | null } | null | undefined);

export const turnierOnlyOn = (env: Record<string, string | undefined> = process.env): boolean => env.TURNIER_ONLY === "1";

/** Neutraler Text der Ruheseite (Entwurf, kein Termin, kein Versprechen). */
export const KOMMT_BALD_TEXT = "Dieser Bereich kommt bald. Im Moment gibt es auf Soccaz Turniere.";

// Präfixe, die samt allem darunter gesperrt sind (Segmentgrenze: "/halle" sperrt "/halle/x", nicht "/halleluja").
const GESPERRT = ["/matchmaking", "/suche", "/hallen", "/halle", "/rangliste", "/mitspieler", "/ligen", "/overlay", "/profitag", "/lobby", "/spiel", "/app/privatspiel", "/app/suche", "/app/guthaben", "/api/lobby", "/api/spiele"];
// Nur der Pfad selbst gesperrt, darunter entscheidet die Seite: /spiele/<id> ist das Spiel eines Turniers (Ergebnis melden), dort prüft die Seite die Spielart.
const NUR_EXAKT = ["/spiele"];

export function pfadGesperrt(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (NUR_EXAKT.includes(p)) return true;
  return GESPERRT.some((x) => p === x || p.startsWith(`${x}/`));
}

/** Startwarnung in Produktion: bei jedem Wert ausser "1" (an) und "0" (bewusst aus) – auch bei fehlender Variable, leerem Wert, "true" oder "yes", die NICHT einschalten. */
export function turnierOnlyWarnung(env: { NODE_ENV?: string; TURNIER_ONLY?: string }): boolean {
  return env.NODE_ENV === "production" && env.TURNIER_ONLY !== "1" && env.TURNIER_ONLY !== "0";
}
