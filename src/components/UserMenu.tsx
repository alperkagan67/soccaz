"use client";

// Konto-Menü der Kopfleiste (Vertrag 013 M2-4a). Natives Popover (`popover` + `popovertarget`): der Browser übernimmt Öffnen/Schließen, Escape, Klick daneben
// (Light Dismiss) und die Rückgabe des Fokus an den Knopf. Dazu Menü-Tastatur nach APG: Pfeil auf/ab, Pos1/Ende, Tab schließt, Startfokus auf dem ersten Eintrag.
// Der Inhalt wird nur im geöffneten Zustand gerendert (kein verstecktes Menü im DOM, keine toten Tab-Stopps; Test-IDs und Rollen wie bisher).
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { buttonClasses } from "./ui/button-styles";

export type MenuLabels = { profile: string; area: string; wallet: string; settings: string; notifications: string; admin: string; signOut: string; help: string };

const ITEM = "ui-focus flex min-h-[var(--tap)] w-full items-center rounded-md px-3 text-left text-sm text-ink no-underline hover:bg-panel2";

export type UserMenuProps = {
  name: string;
  userId: string;
  avatarUrl: string | null;
  balanceText: string;
  unread: number;
  showAdmin: boolean;
  labels: MenuLabels;
  signOutAction: () => Promise<void>;
};

/** Der Inhalt des Menüs (eigene Komponente, damit er ohne Browser als statisches Markup geprüft werden kann). */
export function UserMenuContent({ name, userId, balanceText, unread, showAdmin, labels, signOutAction, onNavigate }: Omit<UserMenuProps, "avatarUrl"> & { onNavigate?: () => void }) {
  return (
    <div role="menu" aria-label={name} className="space-y-1" data-testid="user-menu">
      <p className="truncate border-b border-line px-3 pb-2 pt-1 font-semibold" data-testid="user-menu-name">{name}</p>
      <Link role="menuitem" href={`/spieler/${userId}`} className={ITEM} onClick={onNavigate}>
        {labels.profile}
      </Link>
      <Link role="menuitem" href="/app" className={ITEM} onClick={onNavigate}>
        {labels.area}
      </Link>
      <Link role="menuitem" href="/app/guthaben" className={`${ITEM} justify-between`} onClick={onNavigate}>
        <span>{labels.wallet}</span>
        <span className="tabular-nums text-muted">{balanceText}</span>
      </Link>
      <Link role="menuitem" href="/app/benachrichtigungen" className={`${ITEM} justify-between`} onClick={onNavigate}>
        <span>{labels.notifications}</span>
        {unread > 0 && <span className="rounded-full bg-accent px-2 text-xs font-bold text-accent-ink">{unread > 9 ? "9+" : unread}</span>}
      </Link>
      <Link role="menuitem" href="/app/einstellungen" className={ITEM} onClick={onNavigate}>
        {labels.settings}
      </Link>
      <Link role="menuitem" href="/hilfe" className={ITEM} onClick={onNavigate}>
        {labels.help}
      </Link>
      {showAdmin && (
        <Link role="menuitem" href="/admin" className={ITEM} onClick={onNavigate}>
          {labels.admin}
        </Link>
      )}
      <form action={signOutAction} className="border-t border-line pt-1">
        <button role="menuitem" type="submit" className={ITEM}>
          {labels.signOut}
        </button>
      </form>
    </div>
  );
}

export function UserMenu(props: UserMenuProps) {
  const { name, avatarUrl } = props;
  const id = useId();
  const popoverId = `${id}-menu`;
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Position unter dem Knopf, rechtsbündig (CSS-Anker gibt es noch nicht überall). `beforetoggle` läuft vor dem Anzeigen: kein Springen.
  useEffect(() => {
    const el = popover.current;
    const btn = trigger.current;
    if (!el || !btn) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      el.style.top = `${Math.round(r.bottom + 6)}px`;
      el.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    };
    const onBefore = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") place();
    };
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("beforetoggle", onBefore);
    el.addEventListener("toggle", onToggle);
    window.addEventListener("resize", place);
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
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") close(); // Menü-Muster: Tab schließt und der Fokus geht vom Knopf aus weiter
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={popoverId}
        className={`${buttonClasses("secondary", "sm")} !gap-2`}
        aria-haspopup="menu"
        aria-expanded={open}
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
        <span className="block max-w-[6rem] truncate">{name.split(" ")[0]}</span>
      </button>
      <div
        ref={popover}
        id={popoverId}
        popover="auto"
        onKeyDown={onKeyDown}
        className="fixed inset-auto m-0 w-[min(18rem,calc(100vw-1rem))] overflow-visible rounded-xl border border-line bg-panel p-2 text-sm text-ink shadow-xl"
      >
        {open && <UserMenuContent {...props} onNavigate={close} />}
      </div>
    </>
  );
}
