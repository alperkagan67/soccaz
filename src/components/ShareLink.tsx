"use client";

import { useState } from "react";

/** Einladungslink zum Kopieren und Teilen per WhatsApp. */
export function ShareLink({ url, title, hint, shareText, testId }: { url: string; title: string; hint?: string; shareText: string; testId: string }) {
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
    <section className="card space-y-2" aria-label={title} data-testid={testId}>
      <h2 className="font-semibold">{title}</h2>
      <input readOnly value={url} className="field text-sm" aria-label={title} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost flex-1">{copied ? "Kopiert" : "Link kopieren"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary flex-1" data-testid={`${testId}-whatsapp`}>WhatsApp</a>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </section>
  );
}
