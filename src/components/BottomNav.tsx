"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Start", match: (p: string) => p === "/", icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  { href: "/suche", label: "Suchen", match: (p: string) => p.startsWith("/suche"), icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4" },
  { href: "/spiele", label: "Live", match: (p: string) => p.startsWith("/spiele"), icon: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0" },
  { href: "/app", label: "Meine", match: (p: string) => p.startsWith("/app") || p.startsWith("/lobby") || p.startsWith("/teams"), icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];

/** Untere Navigationsleiste für das Handy (ab sm ausgeblendet, dort gibt es die Kopfleiste). */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const href = item.href === "/app" && !signedIn ? "/anmelden" : item.href;
          return (
            <li key={item.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-green" : "text-muted"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
