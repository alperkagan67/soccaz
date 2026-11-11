"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLabels = { teamGame: string; privateGame: string; tournaments: string; profile: string; findGame: string; main: string };

type Item = { href: string; label: Exclude<keyof NavLabels, "main">; match: (p: string) => boolean; icon: string };

// Richtung E: vier Bereiche und "Spiel suchen" als Mittelknopf (Vertrag 007, AC-1).
const LEFT: Item[] = [
  { href: "/matchmaking", label: "teamGame", match: (p) => p.startsWith("/matchmaking") || p.startsWith("/lobby") || p.startsWith("/teams"), icon: "M3 7h18v10H3zM12 7v10M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0" },
  { href: "/app/privatspiel/neu", label: "privateGame", match: (p) => p.startsWith("/app/privatspiel") || p.startsWith("/einladung"), icon: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" },
];
const RIGHT: Item[] = [
  { href: "/turniere", label: "tournaments", match: (p) => p.startsWith("/turniere") || p.startsWith("/app/turniere"), icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" },
  { href: "/app", label: "profile", match: (p) => (p === "/app" || p.startsWith("/app/")) && !p.startsWith("/app/privatspiel") && !p.startsWith("/app/turniere") || p.startsWith("/spieler"), icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];

/** Untere Navigationsleiste für das Handy (ab sm ausgeblendet, dort gibt es die Kopfleiste). */
export function BottomNav({ signedIn, labels }: { signedIn: boolean; labels: NavLabels }) {
  const pathname = usePathname();
  const entry = (item: Item) => {
    const active = item.match(pathname);
    const needsLogin = item.href.startsWith("/app");
    const href = needsLogin && !signedIn ? `/anmelden?next=${item.href}` : item.href;
    return (
      <li key={item.href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-semibold text-ink" : "text-muted"}`}
        >
          {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" aria-hidden />}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={item.icon} />
          </svg>
          {labels[item.label]}
        </Link>
      </li>
    );
  };
  const searchActive = pathname.startsWith("/suche") || pathname.startsWith("/app/suche");
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {LEFT.map(entry)}
        <li className="flex justify-center">
          <Link
            href="/suche"
            aria-current={searchActive ? "page" : undefined}
            className="-mt-4 flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-bg bg-accent px-2 text-center text-xs font-bold leading-tight text-accent-ink"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4" />
            </svg>
            {labels.findGame}
          </Link>
        </li>
        {RIGHT.map(entry)}
      </ul>
    </nav>
  );
}
