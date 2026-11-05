"use client";

import { useState } from "react";

/** Einladungslink zum Turnier: kopieren oder per WhatsApp teilen. */
export function CopyLink({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Link ist markierbar */
    }
  }
  return (
    <section className="card space-y-2" aria-label="Einladungslink" data-testid="tournament-link">
      <h2 className="font-semibold">Einladungslink zum Turnier</h2>
      <input readOnly value={url} className="field text-sm" aria-label="Einladungslink zum Turnier" onFocus={(e) => e.currentTarget.select()} />
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost flex-1">{copied ? "Kopiert" : "Link kopieren"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`Turnier ${title} auf Socaz: ${url}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary flex-1">WhatsApp</a>
      </div>
      <p className="text-xs text-muted">Nur wer diesen Link hat, findet das private Turnier. Jedes Team schickt einen Captain, die Mitspieler kommen über die Einladung ihres Teams.</p>
    </section>
  );
}
