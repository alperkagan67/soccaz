import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SkipLink } from "@/components/ui/SkipLink";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Counter } from "./Counter";

export const metadata: Metadata = { title: "Komponenten (Entwicklung)", robots: { index: false } };

/** Showcase der Basiskomponenten (Vertrag 013 M2-2). Es gibt sie nur außerhalb der Produktion, dort ist sie 404. */
export default function KomponentenPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const variants = ["primary", "secondary", "danger"] as const;
  return (
    <div data-testid="showcase" className="relative">
      <SkipLink />
      {/* Sprungziel des Skip-Links; im echten Layout ist es <main id="inhalt" tabIndex={-1}> */}
      <div id="inhalt" tabIndex={-1} className="outline-none">
        <PageShell
          width="std"
          aside={
            <div className="card text-sm" data-testid="showcase-aside">
              <p className="font-semibold">Seitenleiste</p>
              <p className="text-muted">Ab 1024 px neben dem Inhalt, darunter darunter.</p>
            </div>
          }
        >
          <PageHeader
            title="Komponenten (Entwicklung)"
            meta="Nur außerhalb der Produktion"
            stand="Du bist bereit, Karte hinterlegt."
            action={{ label: "Zur Spielsuche", href: "/suche" }}
          />
          <section className="space-y-3" aria-labelledby="btn">
            <h2 id="btn" className="text-lg font-semibold">Button</h2>
            {(["md", "sm"] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-3" data-testid={`buttons-${size}`}>
                {variants.map((v) => (
                  <Button key={v} variant={v} size={size}>{v} {size}</Button>
                ))}
                <Button size={size} disabled>gesperrt</Button>
                <Button size={size} pending>speichern</Button>
              </div>
            ))}
          </section>
          <section className="space-y-3" aria-labelledby="lnk">
            <h2 id="lnk" className="text-lg font-semibold">LinkButton</h2>
            <div className="flex flex-wrap items-center gap-3" data-testid="linkbuttons">
              {variants.map((v) => (
                <LinkButton key={v} variant={v} href="/dev/komponenten">{v}</LinkButton>
              ))}
              <LinkButton size="sm" href="/dev/komponenten">klein</LinkButton>
            </div>
          </section>
          <section className="space-y-3" aria-labelledby="ico">
            <h2 id="ico" className="text-lg font-semibold">IconButton</h2>
            <div className="flex flex-wrap items-center gap-3" data-testid="iconbuttons">
              <IconButton label="Schließen" icon="✕" />
              <IconButton label="Hinzufügen" icon="+" variant="primary" />
              <IconButton label="Löschen" icon="🗑" variant="danger" />
              <IconButton label="Gesperrt" icon="✕" disabled />
            </div>
          </section>
          <section className="space-y-3" aria-labelledby="sta">
            <h2 id="sta" className="text-lg font-semibold">StatusBadge</h2>
            <div className="flex flex-wrap items-center gap-3" data-testid="badges">
              <StatusBadge status="ok" label="Karte hinterlegt" />
              <StatusBadge status="warn" label="Zahlung ausstehend" />
              <StatusBadge status="danger" label="Abbuchung fehlgeschlagen" />
              <StatusBadge status="info" label="Findet statt" />
              <StatusBadge status="neutral" label="Offen" />
              <StatusBadge viewer="third" thirdLabel="Dabei" />
            </div>
          </section>
          <section className="space-y-3" aria-labelledby="msg">
            <h2 id="msg" className="text-lg font-semibold">StateMessage</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3" data-testid="messages">
              <StateMessage kind="empty" title="Noch keine Spiele" reason="Du hast noch kein Spiel in deiner Nähe gebucht." action={{ label: "Spiel suchen", href: "/suche" }} />
              <StateMessage kind="error" title="Abbuchung fehlgeschlagen" reason="Deine Karte wurde abgelehnt, bitte ändere sie." action={{ label: "Karte ändern", href: "/app/karte" }} />
              <StateMessage kind="ended" title="Die Spielsuche ist abgelaufen" reason="Der Anstoß liegt in der Vergangenheit." action={{ label: "Neue Spielsuche", href: "/app/suche/neu" }} />
              <StateMessage kind="forbidden" title="Nur für Captains" reason="Dafür brauchst du die Rolle Captain deines Teams." action={{ label: "Zu meinem Team", href: "/app/teams" }} />
            </div>
          </section>
          <section className="space-y-3" aria-labelledby="tas">
            <h2 id="tas" className="text-lg font-semibold">Tastatur</h2>
            <Counter />
          </section>
        </PageShell>
      </div>
    </div>
  );
}
