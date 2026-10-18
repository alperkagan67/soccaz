import Link from "next/link";
import { formatDate } from "@/lib/time";
import type { CommentTarget } from "@/db/schema-content";
import { listComments } from "@/server/content";
import { getCurrentUser } from "@/server/session";
import { CommentActions, CommentForm } from "./CommentForm";

export const Stars = ({ n }: { n: number }) => (
  <span aria-label={`${n} von 5 Sternen`} className="text-yellow">
    {"★".repeat(n)}
    <span className="text-muted">{"☆".repeat(5 - n)}</span>
  </span>
);

/** Kommentare unter einem Profil oder Bewertungen unter einer Halle (Bewertungen mit Sternen). */
export async function Comments({ targetType, targetId, path, title, canWrite = true }: { targetType: CommentTarget; targetId: string; path: string; title: string; canWrite?: boolean }) {
  const user = await getCurrentUser();
  const rows = await listComments(targetType, targetId, user?.id);
  const venue = targetType === "venue";
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title} ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{venue ? "Noch keine Bewertungen." : "Noch keine Kommentare."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="card space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <Link href={`/spieler/${c.authorId}`} className="font-semibold hover:text-green">{c.authorName}</Link>
                  {c.rating ? <span className="ml-2"><Stars n={c.rating} /></span> : null}
                </span>
                <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line break-words text-sm">{c.body}</p>
              {user && <CommentActions commentId={c.id} path={path} mine={c.mine} />}
            </li>
          ))}
        </ul>
      )}
      {canWrite &&
        (user?.onboardedAt ? (
          <CommentForm targetType={targetType} targetId={targetId} path={path} withRating={venue} label={venue ? "Deine Bewertung" : "Dein Kommentar"} />
        ) : (
          <p className="text-sm text-muted">
            <Link href={`/anmelden?next=${encodeURIComponent(path)}`} className="text-green underline">Anmelden</Link>, um {venue ? "zu bewerten" : "zu kommentieren"}.
          </p>
        ))}
    </section>
  );
}
