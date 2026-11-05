import Link from "next/link";

/** Die drei Spielarten, klar getrennt: Teamspiel, Privatspiel, Turnier. */
export function GameModes({ signedIn }: { signedIn: boolean }) {
  const card = "card flex flex-col gap-2";
  return (
    <section className="space-y-3" aria-label="Spielarten" data-testid="game-modes">
      <h2 className="text-lg font-semibold">Was möchtest du spielen?</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card} data-testid="mode-team">
          <h3 className="font-bold">Teamspiel</h3>
          <p className="flex-1 text-sm text-muted">Dein Team gegen ein anderes Team. Der Captain öffnet eine Lobby, die für alle sichtbar ist, ein anderes Team tritt an.</p>
          <Link href="/matchmaking" className="btn btn-primary">Lobby aufmachen</Link>
          <Link href="/suche" className="btn btn-ghost">Offene Lobbys ansehen</Link>
        </div>
        <div className={card} data-testid="mode-private">
          <h3 className="font-bold">Privatspiel</h3>
          <p className="flex-1 text-sm text-muted">Für deine Freundesgruppe: nicht öffentlich, nur per Einladungslink, ohne Rangliste. Du teilst die Spieler in zwei Teams ein.</p>
          <Link href={signedIn ? "/app/privatspiel/neu" : "/anmelden?next=/app/privatspiel/neu"} className="btn btn-primary">Privatspiel anlegen</Link>
        </div>
        <div className={card} data-testid="mode-tournament">
          <h3 className="font-bold">Turnier</h3>
          <p className="flex-1 text-sm text-muted">Mehrere Teams, K.-o.-System, Eintritt pro Spieler. Turniere sind privat und laufen über einen Einladungslink des Veranstalters.</p>
          <Link href="/turniere" className="btn btn-primary">Turniere ansehen</Link>
          <Link href={signedIn ? "/app/turniere/neu" : "/anmelden?next=/app/turniere/neu"} className="btn btn-ghost">Turnier veranstalten</Link>
        </div>
      </div>
    </section>
  );
}
