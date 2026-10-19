import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { can } from "@/lib/roles";
import { formatEuro } from "@/lib/money";
import { walletBalance } from "@/server/ledger";
import { db } from "@/db";
import { unreadCount } from "@/server/notifications";
import { getT } from "@/server/locale";
import { getCurrentUser } from "@/server/session";

export async function Header() {
  const { t } = await getT();
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const balance = user ? await walletBalance(db, user.id) : 0;

  return (
    <header className="sticky top-0 z-20 border-b border-green/15 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Socaz Startseite">
          <Image src="/brand/socca-logo.jpeg" alt="" width={36} height={36} className="rounded-md" priority />
          <span className="font-heading text-lg font-bold tracking-tight">SOCAZ</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/suche" className="hidden px-2 text-muted hover:text-ink sm:inline">
            {t("nav.requests")}
          </Link>
          <Link href="/spiele" className="hidden px-2 text-muted hover:text-ink sm:inline">
            {t("nav.live")}
          </Link>
          <Link href="/rangliste" className="hidden px-2 text-muted hover:text-ink sm:inline">
            {t("nav.ranking")}
          </Link>
          {user ? (
            <>
              <Link
                href="/app/benachrichtigungen"
                className="relative px-2 text-muted hover:text-ink"
                aria-label={unread > 0 ? t("nav.notificationsUnread", { count: unread }) : t("nav.notifications")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && (
                  <span data-testid="unread-badge" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-pink px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/app/guthaben" className="hidden px-2 text-muted hover:text-ink sm:inline" title={t("nav.wallet")} data-testid="header-wallet">
                {formatEuro(balance)}
              </Link>
              {can(user.role, "dashboard") && (
                <Link href="/admin" className="hidden px-2 text-muted hover:text-ink sm:inline">
                  {t("nav.admin")}
                </Link>
              )}
              <Link href="/app" className="btn btn-ghost !min-h-9 !px-3">
                <span className="block max-w-[7rem] truncate">{user.name.split(" ")[0]}</span>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="px-2 text-muted hover:text-ink" aria-label={t("nav.signOut")}>
                  {t("nav.signOut")}
                </button>
              </form>
            </>
          ) : (
            <Link href="/anmelden" className="btn btn-primary !min-h-9 !px-3">
              {t("nav.signIn")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
