import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { can } from "@/lib/roles";
import { formatEuro } from "@/lib/money";
import { UserMenu } from "./UserMenu";
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
    <header className="sticky top-0 z-20 border-b border-accent/15 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2" aria-label="Socaz Startseite">
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
                className="relative inline-flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink"
                aria-label={unread > 0 ? t("nav.notificationsUnread", { count: unread }) : t("nav.notifications")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && (
                  <span data-testid="unread-badge" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-bold leading-5 text-accent-ink">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/app/guthaben" className="hidden px-2 text-muted hover:text-ink sm:inline" title={t("nav.wallet")} data-testid="header-wallet">
                {formatEuro(balance)}
              </Link>
              <UserMenu
                name={user.name}
                userId={user.id}
                avatarUrl={user.avatarUrl ?? null}
                balanceText={formatEuro(balance)}
                unread={unread}
                showAdmin={can(user.role, "dashboard")}
                labels={{ profile: t("menu.profile"), area: t("menu.area"), wallet: t("nav.wallet"), settings: t("menu.settings"), notifications: t("nav.notifications"), admin: t("nav.admin"), signOut: t("nav.signOut"), help: t("footer.help"), account: t("menu.account"), unread: t("menu.unread") }}
                signOutAction={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              />
            </>
          ) : (
            <Link href="/anmelden" className="btn btn-primary !px-3">
              {t("nav.signIn")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
