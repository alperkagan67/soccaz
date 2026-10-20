"use client";

import { useState } from "react";

/** Spielort auf einen Blick: Halle, Adresse (kopierbar), Uhrzeit und Knöpfe zu Google Maps und Apple Maps. */
export function VenueBox({ name, address, city, when, lat, lng }: { name: string; address: string | null; city: string | null; when: string; lat: number | null; lng: number | null }) {
  const [copied, setCopied] = useState(false);
  const full = [address, city].filter(Boolean).join(", ");
  const query = lat !== null && lng !== null ? `${lat},${lng}` : [name, address, city].filter(Boolean).join(", ");
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const apple = `https://maps.apple.com/?q=${encodeURIComponent(name)}&${lat !== null && lng !== null ? `ll=${lat},${lng}` : `address=${encodeURIComponent(full || name)}`}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${name}, ${full}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Kopieren nicht möglich: der Text ist markierbar */
    }
  }

  return (
    <section className="card space-y-3" aria-label="Spielort" data-testid="venue-box">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Spielort</h2>
      <div>
        <p className="text-lg font-bold" data-testid="venue-name">{name}</p>
        <p className="select-all text-sm" data-testid="venue-address">{full || "Adresse noch nicht hinterlegt"}</p>
        <p className="mt-1 text-sm text-muted" data-testid="venue-time">{when} Uhr</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost !min-h-9 !px-3 text-sm">{copied ? "Kopiert" : "Adresse kopieren"}</button>
        <a href={google} target="_blank" rel="noopener noreferrer" className="btn btn-primary !min-h-9 !px-3 text-sm">Google Maps</a>
        <a href={apple} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !min-h-9 !px-3 text-sm">Apple Maps</a>
      </div>
    </section>
  );
}
