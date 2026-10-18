"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteCommentAction, postCommentAction, reportCommentAction } from "@/server/content-actions";
import { FieldError, SubmitButton } from "./FormBits";
import { useFormAction } from "./useFormAction";

export function CommentForm({ targetType, targetId, path, withRating, label }: { targetType: "team" | "player" | "venue"; targetId: string; path: string; withRating?: boolean; label: string }) {
  const { state, pending, onSubmit } = useFormAction(postCommentAction);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="card space-y-3">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="path" value={path} />
      {withRating && (
        <div>
          <label className="label" htmlFor="rating">Sterne</label>
          <select id="rating" name="rating" defaultValue="5" className="field">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)} ({n})</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="comment-body">{label}</label>
        <textarea id="comment-body" name="body" rows={3} maxLength={500} required className="field" />
      </div>
      <SubmitButton pending={pending}>Senden</SubmitButton>
      {state?.error && <FieldError message={state.error} />}
      {state?.ok && <p className="text-sm text-green" role="status">Gespeichert.</p>}
    </form>
  );
}

export function CommentActions({ commentId, path, mine }: { commentId: string; path: string; mine: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");

  if (mine) {
    return (
      <button
        className="text-xs text-muted underline"
        disabled={pending}
        onClick={() => start(async () => setMessage((await deleteCommentAction(commentId, path))?.error))}
      >
        Löschen
      </button>
    );
  }
  if (message === "ok") return <span className="text-xs text-muted">Danke, wir schauen es uns an.</span>;
  return reporting ? (
    <span className="flex items-center gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund" aria-label="Grund der Meldung" maxLength={200} className="field !min-h-8 !w-40 !py-1 text-xs" />
      <button
        className="text-xs text-coral underline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reportCommentAction(commentId, path, reason);
            setMessage(r?.error ?? "ok");
          })
        }
      >
        Senden
      </button>
      {message && message !== "ok" && <span className="error text-xs">{message}</span>}
    </span>
  ) : (
    <button className="text-xs text-muted underline" onClick={() => setReporting(true)}>
      Melden
    </button>
  );
}
