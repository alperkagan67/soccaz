"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MenuLabels = { profile: string; area: string; wallet: string; settings: string; notifications: string; admin: string; signOut: string; help: string };

/** Konto-Menü in der Kopfleiste: Profil, Mein Bereich, Guthaben, Einstellungen, Abmelden. Schließt bei Klick daneben und mit Escape. */
export function UserMenu({
  name,
  userId,
  avatarUrl,
  balanceText,
  unread,
  showAdmin,
  labels,
  signOut,
}: {
  name: string;
  userId: string;
  avatarUrl: string | null;
  balanceText: string;
  unread: number;
  showAdmin: boolean;
  labels: MenuLabels;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block rounded-md px-3 py-2 hover:bg-panel2";
  const close = () => setOpen(false);
  return (
    <div ref={root} className="relative">
      <button className="btn btn-ghost !min-h-9 !gap-2 !px-3" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="user-menu-button">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={22} height={22} className="size-[22px] rounded-full object-cover" />
        ) : (
          <span className="grid size-[22px] place-items-center rounded-full bg-green text-xs font-bold text-black" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="block max-w-[6rem] truncate">{name.split(" ")[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-60 space-y-1 rounded-xl border border-line bg-panel p-2 text-sm shadow-xl" data-testid="user-menu">
          <p className="truncate border-b border-line px-3 pb-2 pt-1 font-semibold" data-testid="user-menu-name">{name}</p>
          <Link role="menuitem" href={`/spieler/${userId}`} className={item} onClick={close}>
            {labels.profile}
          </Link>
          <Link role="menuitem" href="/app" className={item} onClick={close}>
            {labels.area}
          </Link>
          <Link role="menuitem" href="/app/guthaben" className={`${item} flex justify-between`} onClick={close}>
            <span>{labels.wallet}</span>
            <span className="tabular-nums text-muted">{balanceText}</span>
          </Link>
          <Link role="menuitem" href="/app/benachrichtigungen" className={`${item} flex justify-between`} onClick={close}>
            <span>{labels.notifications}</span>
            {unread > 0 && <span className="rounded-full bg-pink px-1.5 text-xs font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link role="menuitem" href="/app/einstellungen" className={item} onClick={close}>
            {labels.settings}
          </Link>
          <Link role="menuitem" href="/hilfe" className={item} onClick={close}>
            {labels.help}
          </Link>
          {showAdmin && (
            <Link role="menuitem" href="/admin" className={item} onClick={close}>
              {labels.admin}
            </Link>
          )}
          <form action={signOut} className="border-t border-line pt-1">
            <button role="menuitem" className={`${item} w-full text-left text-coral`}>
              {labels.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
