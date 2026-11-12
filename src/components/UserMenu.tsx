"use client";

// Konto-Menü der Kopfleiste (Vertrag 013 M2-4a). Natives Popover (`popover` + `popovertarget`): der Browser übernimmt Öffnen/Schließen, Escape, Klick daneben
// (Light Dismiss) und die Rückgabe des Fokus an den Knopf. Dazu Menü-Tastatur nach APG: Pfeil auf/ab, Pos1/Ende, Tab schließt, Startfokus auf dem ersten Eintrag.
// Vor der Hydration (und ohne Skript) steht der Inhalt im (versteckten) Popover, damit der native Knopf nichts Leeres öffnet; danach wird er nur noch im offenen
// Zustand gerendert (kein verstecktes Menü im DOM, keine toten Tab-Stopps; Test-IDs und Rollen wie bisher). Mindestversionen: siehe DESIGN.md (Popover-API).
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { buttonClasses } from "./ui/button-styles";

export type MenuLabels = { games: string; venue: string; wallet: string; settings: string; notifications: string; admin: string; signOut: string; help: string; account: string; unread: string };

const ITEM = "ui-focus flex min-h-[var(--tap)] w-full items-center rounded-md px-3 text-left text-sm text-ink no-underline hover:bg-panel2";
const SEPARATOR = "my-1 border-t border-line";

export type UserMenuProps = {
  name: string;
  userId: string;
  avatarUrl: string | null;
  balanceText: string;
  unread: number;
  showAdmin: boolean;
  /** Hallenbetreiber (mindestens eine Halle zugewiesen): Eintrag "Meine Halle" */
  showVenue: boolean;
  labels: MenuLabels;
  signOutAction: () => Promise<void>;
};

/** Der Inhalt des Menüs (eigene Komponente, damit er ohne Browser als statisches Markup geprüft werden kann). */
export function UserMenuContent({ name, balanceText, unread, showAdmin, showVenue, labels, signOutAction, onNavigate }: Omit<UserMenuProps, "avatarUrl" | "userId"> & { onNavigate?: () => void }) {
  const titleId = useId();
  return (
    <div data-testid="user-menu" className="space-y-1">
      {/* Der Name steht als Titel über dem Menü, nicht darin: in role=menu sind nur Einträge, Gruppen und Trenner erlaubt */}
      <p id={titleId} className="truncate border-b border-line px-3 pb-2 pt-1 font-semibold" data-testid="user-menu-name">
        {name}
      </p>
      <div role="menu" aria-labelledby={titleId} className="space-y-1">
        {/* Gruppe 1: wohin der Nutzer meistens will (Textentscheid t9): Meine Spiele, bei Betreibern Meine Halle, bei Admins Admin */}
        <Link role="menuitem" href="/app" className={ITEM} onClick={onNavigate}>
          {labels.games}
        </Link>
        {showVenue && (
          <Link role="menuitem" href="/halle" className={ITEM} onClick={onNavigate}>
            {labels.venue}
          </Link>
        )}
        {showAdmin && (
          <Link role="menuitem" href="/admin" className={ITEM} onClick={onNavigate}>
            {labels.admin}
          </Link>
        )}
        <div role="separator" className={SEPARATOR} />
        {/* Gruppe 2: Konto (Einstellungen mit Karte ändern, Profil-Link, Guthaben bis 012 M5, Benachrichtigungen, Hilfe) */}
        <Link role="menuitem" href="/app/benachrichtigungen" className={`${ITEM} justify-between`} onClick={onNavigate}>
          <span>{labels.notifications}</span>
          {unread > 0 && (
            <>
              <span aria-hidden="true" className="min-w-6 rounded-full bg-accent px-2 text-center text-sm font-bold text-accent-ink">
                {unread > 9 ? "9+" : unread}
              </span>
              <span className="sr-only">
                {" "}
                {unread} {labels.unread}
              </span>
            </>
          )}
        </Link>
        <Link role="menuitem" href="/app/guthaben" className={`${ITEM} justify-between`} onClick={onNavigate}>
          <span>{labels.wallet}</span>
          <span className="tabular-nums text-muted">{balanceText}</span>
        </Link>
        <Link role="menuitem" href="/app/einstellungen" className={ITEM} onClick={onNavigate}>
          {labels.settings}
        </Link>
        <Link role="menuitem" href="/hilfe" className={ITEM} onClick={onNavigate}>
          {labels.help}
        </Link>
        <div role="separator" className={SEPARATOR} />
        {/* Abmelden ist nur das Abmelden vom Konto (Logout, begriffe.md) */}
        <form action={signOutAction} role="none">
          <button role="menuitem" type="submit" className={ITEM}>
            {labels.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}

export function UserMenu(props: UserMenuProps) {
  const { name, avatarUrl, labels } = props;
  const id = useId();
  const popoverId = `${id}-menu`;
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Position unter dem Knopf, rechtsbündig (CSS-Anker gibt es noch nicht überall), und so hoch wie der Platz es erlaubt (niedrige Fenster, Zoom).
  // `beforetoggle` läuft vor dem Anzeigen: kein Springen.
  useEffect(() => {
    const el = popover.current;
    const btn = trigger.current;
    if (!el || !btn) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      const doc = document.documentElement; // ohne Bildlaufleiste, anders als window.innerWidth
      const top = Math.round(r.bottom + 6);
      el.style.top = `${top}px`;
      el.style.right = `${Math.max(8, Math.round(doc.clientWidth - r.right))}px`;
      el.style.maxHeight = `${Math.max(120, doc.clientHeight - top - 8)}px`;
    };
    const onBefore = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") place();
    };
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("beforetoggle", onBefore);
    el.addEventListener("toggle", onToggle);
    window.addEventListener("resize", place);
    // Wurde das Popover schon vor der Hydration geöffnet (nativer Knopf), den Zustand nachziehen
    setMounted(true);
    if (el.matches(":popover-open")) {
      place();
      setOpen(true);
    }
    return () => {
      el.removeEventListener("beforetoggle", onBefore);
      el.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", place);
    };
  }, []);

  // Startfokus: erster Eintrag (das Menü ist erst jetzt gerendert)
  useEffect(() => {
    if (open) popover.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const close = () => popover.current?.hidePopover();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") close(); // Menü-Muster: Tab schließt und der Fokus geht vom Knopf aus weiter
  }

  const first = name.split(" ")[0];
  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={popoverId}
        className={`${buttonClasses("secondary", "sm")} group !gap-2 aria-expanded:bg-panel2`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${labels.account}: ${first}`}
        data-testid="user-menu-button"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={24} height={24} className="size-6 rounded-full object-cover" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="block max-w-[6rem] truncate">{first}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 transition-transform motion-reduce:transition-none group-aria-expanded:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        ref={popover}
        id={popoverId}
        popover="auto"
        onKeyDown={onKeyDown}
        className="fixed inset-auto m-0 w-[min(18rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-rim bg-panel p-2 text-sm text-ink shadow-2xl not-supports-[selector(:popover-open)]:hidden"
      >
        {(open || !mounted) && <UserMenuContent {...props} onNavigate={close} />}
      </div>
    </>
  );
}
