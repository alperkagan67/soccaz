"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Kind = "avatar" | "team_logo" | "match_photo";

/** Bild auswählen und hochladen. Der Server prüft, verkleinert und kodiert neu. */
export function ImageUpload({ kind, refId, label }: { kind: Kind; refId: string; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    if (file.size > 5 * 1024 * 1024) return setError("Das Bild ist größer als 5 MB.");
    setBusy(true);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("refId", refId);
      body.set("file", file);
      const response = await fetch("/api/media", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(json.error ?? "Hochladen fehlgeschlagen.");
      else router.refresh();
    } catch {
      setError("Hochladen fehlgeschlagen. Prüfe deine Verbindung.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <label className="btn btn-ghost !min-h-9 cursor-pointer !px-3 text-sm">
        {busy ? "Lädt hoch…" : label}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} disabled={busy} aria-label={label} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
