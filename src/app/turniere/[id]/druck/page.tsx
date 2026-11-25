import type { Metadata } from "next";
import { EinladungUngueltig } from "@/components/EinladungUngueltig";
import { formatDateTime, formatTime } from "@/lib/time";
import { roundTitle } from "@/lib/tournament";
import { tieMarke } from "@/lib/tiebreak-regeln";
import { getCurrentUser } from "@/server/session";
import { getTournament } from "@/server/tournaments";
import { DruckKnopf } from "./DruckKnopf";

// Papier-Fallback für den Turniertag (t2q Option B): Spielplan als Tabelle ALLER Spiele mit leerem Ergebnisfeld zum Ausfüllen, dazu die Bracket-Übersicht. Reines Server-Render (druckt ohne JavaScript),
// hell und im Querformat (Druck-Regeln in globals.css, @page unten), ohne Kopf, Menü und Knöpfe. Zugang EXAKT wie die Turnierseite: getTournament (öffentlich = jeder; privat nur mit gültigem Token oder als
// Veranstalter/Admin/Mitglied), sonst die neutrale Seite. Keine Personendaten: nur Turnier- und Teamnamen.
export const metadata: Metadata = { title: "Spielplan drucken", robots: { index: false, follow: false } };

export default async function TurnierDruckPage({ params, searchParams }: PageProps<"/turniere/[id]/druck">) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const user = await getCurrentUser();
  const data = await getTournament(id, user ? { id: user.id, role: user.role } : null, token);
  if (!data) return <EinladungUngueltig />; // unbekannt, keine UUID, privat ohne gültigen Token: dieselbe neutrale Seite wie die Turnierseite
  const { tournament: t, stages, schedule } = data;
  const rounds = stages
    .filter((s) => s.stage.startsWith("ko:"))
    .map((s) => ({ ...s, n: Number(s.stage.slice(3)) }))
    .sort((a, b) => b.n - a.n);
  const zeit = (iso: string) => `${formatTime(new Date(iso))}`;

  return (
    <div className="druck space-y-4" data-testid="druck">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold" data-testid="druck-titel">{t.name}: Spielplan</h1>
          <p className="text-sm">
            {t.city}
            {t.venueText ? ` · ${t.venueText}` : ""}
            {t.startsAt ? ` · ${formatDateTime(t.startsAt)} Uhr` : ` · ${t.startsOn}`} · K.-o.-System · Stand {formatDateTime(new Date())} Uhr
          </p>
        </div>
        <div className="print-hide flex flex-col items-end gap-1 text-sm">
          <DruckKnopf />
          <noscript>Zum Drucken: Browser-Menü, „Drucken“ (oder „Teilen“, „Drucken“ am Handy).</noscript>
        </div>
      </div>

      {!schedule ? (
        <p className="rounded border-2 border-ink p-3 text-sm" data-testid="druck-noch-kein-plan">
          Der Spielplan steht noch nicht. Er erscheint, sobald alle Plätze belegt und alle Teams vollzählig sind oder der Veranstalter die Anmeldung schließt.
        </p>
      ) : (
        <>
          <section className="space-y-2" aria-labelledby="druck-spiele">
            <h2 id="druck-spiele" className="text-lg font-semibold">Alle Spiele</h2>
            <table className="w-full border-collapse text-sm" data-testid="druck-tabelle">
              <thead>
                <tr className="text-left">
                  <th className="border border-ink px-2 py-1">Zeit</th>
                  <th className="border border-ink px-2 py-1">Runde</th>
                  <th className="border border-ink px-2 py-1">Platz</th>
                  <th className="border border-ink px-2 py-1">Spiel</th>
                  <th className="border border-ink px-2 py-1">Ergebnis</th>
                  <th className="border border-ink px-2 py-1">Golden Goal / Neunmeter</th>
                </tr>
              </thead>
              <tbody>
                {schedule.blocks.flatMap((b) =>
                  b.games.map((g, i) => (
                    <tr key={`${b.startIso}-${g.court}-${i}`} data-testid="druck-spiel" className="break-inside-avoid">
                      <td className="border border-ink px-2 py-2 whitespace-nowrap">{zeit(b.startIso)} bis {zeit(b.endIso)} Uhr</td>
                      <td className="border border-ink px-2 py-2">{b.label}{g.fun ? " (Spaßspiel)" : ""}</td>
                      <td className="border border-ink px-2 py-2 text-center">{g.court}</td>
                      <td className="border border-ink px-2 py-2">
                        {g.nameA && g.nameB ? `${g.nameA} – ${g.nameB}` : g.fun ? "Verlierer der Halbfinals" : "Gegner stehen noch nicht fest"}
                      </td>
                      <td className="border border-ink px-2 py-2 whitespace-nowrap" aria-label="Ergebnis zum Eintragen">{g.fun ? "ohne Wertung" : "____ : ____"}</td>
                      <td className="border border-ink px-2 py-2 min-w-40" aria-label="Golden Goal oder Neunmeter zum Eintragen">{g.fun ? "" : "GG [  ]   9m [  ]   ____"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            <p className="text-xs">Die Zeiten sind Anpfiff bis Spielende, danach folgt der Puffer von {schedule.gapMinutes} Minuten. Der Plan dauert höchstens {schedule.totalMinutes} Minuten (bis {zeit(schedule.endIso)} Uhr).</p>
          </section>

          <section className="space-y-2 break-before-page" aria-labelledby="druck-bracket">
            <h2 id="druck-bracket" className="text-lg font-semibold">Bracket</h2>
            <div className="flex gap-6" data-testid="druck-bracket">
              {rounds.map((r) => (
                <div key={r.stage} className="min-w-0 flex-1 space-y-2">
                  <h3 className="text-center text-sm font-semibold">{roundTitle(r.n)}</h3>
                  {r.matches.map((m) => (
                    <div key={m.id} className="break-inside-avoid rounded border border-ink p-2 text-sm" data-testid="druck-bracket-spiel">
                      <p className="flex justify-between gap-2"><span>{m.nameA ?? "offen"}</span><span className="tabular-nums">{m.scoreA ?? ""}</span></p>
                      <p className="flex justify-between gap-2 border-t border-ink pt-1"><span>{m.nameB ?? "offen"}</span><span className="tabular-nums">{m.scoreB ?? ""}</span></p>
                      {tieMarke(m) && <p className="pt-1 text-center text-xs font-semibold">{tieMarke(m)}</p>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
