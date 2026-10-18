import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-24 text-xs text-muted sm:px-6 sm:pb-8">
      <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4">
        <Link href="/impressum" className="hover:text-ink">Impressum</Link>
        <Link href="/datenschutz" className="hover:text-ink">Datenschutz</Link>
        <Link href="/agb" className="hover:text-ink">AGB</Link>
        <Link href="/hausordnung" className="hover:text-ink">Hausordnung</Link>
        <Link href="/hallen" className="hover:text-ink">Hallen</Link>
      </nav>
    </footer>
  );
}
