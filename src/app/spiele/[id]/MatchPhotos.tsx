"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";

type Photo = { id: string; mine: boolean };

export function MatchPhotos({ matchId, photos, canUpload, canModerate }: { matchId: string; photos: Photo[]; canUpload: boolean; canModerate: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();

  async function remove(id: string) {
    setError(undefined);
    const response = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!response.ok) setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Löschen fehlgeschlagen.");
    else router.refresh();
  }

  if (photos.length === 0 && !canUpload) return null;
  return (
    <section className="card space-y-3" aria-label="Fotos">
      <h2 className="font-semibold">Fotos</h2>
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="relative">
              <a href={`/api/media/${p.id}`} target="_blank" rel="noreferrer">
                <Image src={`/api/media/${p.id}`} alt="Foto vom Spiel" width={400} height={300} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" />
              </a>
              {(p.mine || canModerate) && (
                <button className="absolute right-1 top-1 rounded bg-bg/80 px-2 py-0.5 text-xs text-coral" onClick={() => remove(p.id)} aria-label="Foto löschen">
                  Löschen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {canUpload && <ImageUpload kind="match_photo" refId={matchId} label="Foto hinzufügen" />}
    </section>
  );
}
