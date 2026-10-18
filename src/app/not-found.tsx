import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto mt-10 max-w-sm space-y-3 text-center">
      <h1 className="text-2xl font-bold">Seite nicht gefunden</h1>
      <p className="text-muted">Diese Seite gibt es nicht oder nicht mehr.</p>
      <Link href="/" className="btn btn-primary">Zur Startseite</Link>
    </section>
  );
}
