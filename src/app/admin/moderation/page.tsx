import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { moderationQueue } from "@/server/content";
import { requirePermission } from "@/server/session";
import { ModerationButtons } from "./ModerationButtons";

export const metadata: Metadata = { title: "Moderation" };

const TARGET_HREF = (type: string, id: string) => (type === "team" ? null : type === "player" ? `/spieler/${id}` : `/hallen/${id}`);

export default async function ModerationPage() {
  await requirePermission("moderation", "/admin/moderation");
  const { rows } = await moderationQueue();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Moderation</h1>
      <p className="text-sm text-muted">Gemeldete und automatisch ausgeblendete Kommentare. Ab drei Meldungen wird ein Kommentar vorläufig versteckt.</p>
      {rows.length === 0 ? (
        <p className="card text-muted">Nichts zu prüfen.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const href = TARGET_HREF(c.target_type, c.target_id);
            return (
              <li key={c.id} className="card space-y-2" data-testid="moderation-item">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <Link href={`/spieler/${c.author_id}`} className="font-semibold hover:text-green">{c.author_name}</Link>
                    <span className="ml-2 text-xs text-muted">{c.warnings} Verwarnung{c.warnings === 1 ? "" : "en"}</span>
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(new Date(c.created_at))} Uhr · {c.status === "hidden" ? "ausgeblendet" : "sichtbar"} · {c.reports} Meldung{c.reports === 1 ? "" : "en"}</span>
                </div>
                <p className="whitespace-pre-line break-words text-sm">{c.body}</p>
                {c.reasons.length > 0 && <p className="text-xs text-coral">Gründe: {c.reasons.join(" · ")}</p>}
                {href && <Link href={href} className="text-xs text-green underline">Zur Seite</Link>}
                <ModerationButtons commentId={c.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
