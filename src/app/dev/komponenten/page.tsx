import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SkipLink } from "@/components/ui/SkipLink";
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
          <section className="space-y-3" aria-labelledby="tas">
            <h2 id="tas" className="text-lg font-semibold">Tastatur</h2>
            <Counter />
          </section>
        </PageShell>
      </div>
    </div>
  );
}
