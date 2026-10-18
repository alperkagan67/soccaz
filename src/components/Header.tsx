import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/server/session";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 border-b border-green/15 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Socaz Startseite">
          <Image src="/brand/socca-logo.jpeg" alt="" width={36} height={36} className="rounded-md" priority />
          <span className="font-heading text-lg font-bold tracking-tight">SOCAZ</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/suche" className="hidden px-2 text-muted hover:text-ink sm:inline">
            Spielsuchen
          </Link>
          <Link href="/spiele" className="hidden px-2 text-muted hover:text-ink sm:inline">
            Livescore
          </Link>
          {user ? (
            <>
              <Link href="/app" className="btn btn-ghost !min-h-9 !px-3">
                {user.name.split(" ")[0]}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="px-2 text-muted hover:text-ink" aria-label="Abmelden">
                  Abmelden
                </button>
              </form>
            </>
          ) : (
            <Link href="/anmelden" className="btn btn-primary !min-h-9 !px-3">
              Anmelden
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
