import Link from "next/link";
import { formatDate } from "@/lib/time";
import type { CommentTarget } from "@/db/schema-content";
import { commentView, type CommentRow } from "@/lib/comment-sicht";
import type { LobbySicht } from "@/lib/lobby-namen";
import { listComments } from "@/server/content";
import { getViewerSicht } from "@/server/viewer-sicht";
import { CommentActions, CommentForm } from "./CommentForm";

export const Stars = ({ n }: { n: number }) => (
  <span aria-label={`${n} von 5 Sternen`} className="text-ink">
    {"★".repeat(n)}
    <span className="text-muted">{"☆".repeat(5 - n)}</span>
  </span>
);

/** Kommentare unter einem Profil oder Bewertungen unter einer Halle (Bewertungen mit Sternen). Autoren: Angemeldete Name und Link, Gäste und reine Hallenbetreiber Initialen ohne Link (AC-17, Entscheid t2q 2026-11-24). */
export async function Comments({ targetType, targetId, path, title, canWrite = true }: { targetType: CommentTarget; targetId: string; path: string; title: string; canWrite?: boolean }) {
  const { user, sicht } = await getViewerSicht();
  // Name und Autor-Kennung bleiben hier: an die Darstellung geht nur die Sicht-Zeile (Initialen oder Name samt Link)
  const rows = commentView(await listComments(targetType, targetId, user?.id), sicht);
  return <CommentList rows={rows} sicht={sicht} venue={targetType === "venue"} targetType={targetType} targetId={targetId} path={path} title={title} canWrite={canWrite} signedIn={Boolean(user)} canPost={Boolean(user?.onboardedAt)} />;
}

/** Reine Darstellung (ohne Datenbank, renderToStaticMarkup-Test je Rolle). */
export function CommentList({ rows, sicht, venue, targetType, targetId, path, title, canWrite, signedIn, canPost }: { rows: CommentRow[]; sicht: LobbySicht; venue: boolean; targetType: CommentTarget; targetId: string; path: string; title: string; canWrite: boolean; signedIn: boolean; canPost: boolean }) {
  return (
    <section className="space-y-3" aria-label={title} data-sicht={sicht}>
      <h2 className="text-lg font-semibold">{title} ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{venue ? "Noch keine Bewertungen." : "Noch keine Kommentare."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="card space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {c.href ? (
                    <Link href={c.href} className="font-semibold hover:text-accent-fg" data-testid="comment-author">{c.label}</Link>
                  ) : (
                    <span className="font-semibold" data-testid="comment-author">{c.label}</span>
                  )}
                  {c.rating ? <span className="ml-2"><Stars n={c.rating} /></span> : null}
                </span>
                <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line break-words text-sm">{c.body}</p>
              {signedIn && <CommentActions commentId={c.id} path={path} mine={c.mine} />}
            </li>
          ))}
        </ul>
      )}
      {canWrite &&
        (canPost ? (
          <CommentForm targetType={targetType} targetId={targetId} path={path} withRating={venue} label={venue ? "Deine Bewertung" : "Dein Kommentar"} />
        ) : (
          <p className="text-sm text-muted">
            <Link href={`/anmelden?next=${encodeURIComponent(path)}`} className="text-accent-fg underline">Anmelden</Link>, um {venue ? "zu bewerten" : "zu kommentieren"}.
          </p>
        ))}
    </section>
  );
}
