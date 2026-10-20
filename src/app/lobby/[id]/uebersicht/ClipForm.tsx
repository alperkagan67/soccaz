"use client";

import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { addClipAction, deleteClipAction } from "@/server/clips-actions";

export function ClipForm({ matchId }: { matchId: string }) {
  return (
    <ActionForm action={addClipAction.bind(null, matchId)} submit="Clip veröffentlichen" className="space-y-2 border-t border-line pt-3" successText="Clip veröffentlicht.">
      <h3 className="text-sm font-semibold">Clip einstellen</h3>
      <div>
        <label className="label" htmlFor="clip-title">Titel</label>
        <input id="clip-title" name="title" maxLength={80} required className="field" placeholder="z. B. Tor des Spiels" />
      </div>
      <div>
        <label className="label" htmlFor="clip-url">Link (YouTube, Instagram, TikTok …)</label>
        <input id="clip-url" name="url" type="url" required className="field" placeholder="https://" />
      </div>
    </ActionForm>
  );
}

export function DeleteClip({ matchId, clipId }: { matchId: string; clipId: string }) {
  return <ActionButton action={deleteClipAction.bind(null, matchId, clipId)} label="Löschen" confirm="Clip wirklich löschen?" />;
}
