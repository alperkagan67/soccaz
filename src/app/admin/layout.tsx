import Link from "next/link";
import { can, canUser, type Permission } from "@/lib/roles";
import { countOpenDisputes } from "@/server/payments/dispute-admin";
import { requirePermission } from "@/server/session";
import { countVenueRequests } from "@/server/venue-approval";

const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Übersicht", permission: "dashboard" },
  { href: "/admin/spiele", label: "Spiele", permission: "admin" },
  { href: "/admin/nutzer", label: "Nutzer", permission: "admin" },
  { href: "/admin/teams", label: "Teams", permission: "admin" },
  { href: "/admin/ligen", label: "Ligen", permission: "admin" },
  { href: "/admin/profitag", label: "Profi-Tag", permission: "admin" },
  { href: "/admin/sponsoren", label: "Sponsoren", permission: "admin" },
  { href: "/admin/moderation", label: "Moderation", permission: "moderation" },
  { href: "/admin/finanzen", label: "Finanzen", permission: "finance" },
  { href: "/admin/zahlungsstreit", label: "Zahlungsstreit", permission: "admin" },
  { href: "/admin/buchungen", label: "Buchungen", permission: "booking" },
  { href: "/admin/hallen", label: "Hallen", permission: "booking" },
  { href: "/admin/protokoll", label: "Protokoll", permission: "admin" },
  { href: "/admin/beweis", label: "Beweise", permission: "owner" },
  { href: "/admin/einstellungen", label: "Einstellungen", permission: "owner" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermission("dashboard");
  const openVenueRequests = canUser(user, "booking") ? await countVenueRequests() : 0; // offene Hallen-Anfragen (013 v3 AC-31)
  const openDisputes = can(user.role, "admin") ? await countOpenDisputes() : 0; // Hinweis in der Navigation (nur fuer die Berechtigung admin)
  return (
    <div className="space-y-4">
      <nav aria-label="Admin-Bereich" className="-mx-1 flex flex-wrap gap-1 border-b border-line pb-2 text-sm">
        {NAV.filter((n) => canUser(user, n.permission)).map((n) => (
          <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted hover:bg-panel hover:text-ink">
            {n.label}
            {n.href === "/admin/hallen" && openVenueRequests > 0 && <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-xs text-bg" data-testid="open-venue-requests">{openVenueRequests}<span className="sr-only"> offene Hallen-Anfragen</span></span>}
            {n.href === "/admin/zahlungsstreit" && openDisputes > 0 && <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-xs text-bg" data-testid="open-disputes-badge">{openDisputes}</span>}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
