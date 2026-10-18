"use client";

import { useState } from "react";

const NAMES = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" } as const;

/** Der Player wird erst nach einem Klick geladen: Vorher fließen keine Daten an den Anbieter. */
export function StreamEmbed({ provider, embedUrl }: { provider: keyof typeof NAMES; embedUrl: string }) {
  const [loaded, setLoaded] = useState(false);
  const name = NAMES[provider];
  return (
    <section className="space-y-1" aria-label="Live-Stream">
      <div className="aspect-video overflow-hidden rounded-xl border border-line bg-black">
        {loaded ? (
          <iframe src={embedUrl} title={`Live-Stream (${name})`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="size-full" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
            <button className="btn btn-primary" onClick={() => setLoaded(true)}>
              Stream von {name} laden
            </button>
            <p className="max-w-xs text-xs text-muted">Beim Laden werden Daten (z. B. deine IP-Adresse) an {name} übertragen.</p>
          </div>
        )}
      </div>
    </section>
  );
}
