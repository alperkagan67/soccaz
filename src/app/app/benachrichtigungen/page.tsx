import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { listNotifications } from "@/server/notifications";
import { requireUser } from "@/server/session";
import { MarkReadOnView } from "./MarkReadOnView";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function NotificationsPage() {
  const user = await requireUser("/app/benachrichtigungen");
  const items = await listNotifications(user.id);
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Benachrichtigungen</h1>
        <Link href="/app/einstellungen" className="text-sm text-muted underline">Einstellungen</Link>
      </div>
      {hasUnread && <MarkReadOnView />}
      {items.length === 0 ? (
        <p className="card text-muted">Noch keine Benachrichtigungen.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                </span>
                <span className="block text-sm text-muted">{n.body}</span>
              </>
            );
            const tone = n.readAt ? "" : "border-green";
            return (
              <li key={n.id}>
                {n.url ? (
                  <Link href={n.url} className={`card block hover:border-green ${tone}`}>{body}</Link>
                ) : (
                  <div className={`card ${tone}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
