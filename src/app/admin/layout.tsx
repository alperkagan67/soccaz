import Link from "next/link";
import { can, type Permission } from "@/lib/roles";
import { requirePermission } from "@/server/session";

const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Übersicht", permission: "dashboard" },
  { href: "/admin/spiele", label: "Spiele", permission: "admin" },
  { href: "/admin/nutzer", label: "Nutzer", permission: "admin" },
  { href: "/admin/teams", label: "Teams", permission: "admin" },
  { href: "/admin/protokoll", label: "Protokoll", permission: "admin" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermission("dashboard");
  return (
    <div className="space-y-4">
      <nav aria-label="Admin-Bereich" className="-mx-1 flex flex-wrap gap-1 border-b border-line pb-2 text-sm">
        {NAV.filter((n) => can(user.role, n.permission)).map((n) => (
          <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-muted hover:bg-panel hover:text-ink">
            {n.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
