"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto mt-10 max-w-sm space-y-3 text-center" role="alert">
      <h1 className="text-2xl font-bold">Da ist etwas schiefgelaufen</h1>
      <p className="text-muted">Das tut uns leid. Versuche es noch einmal. Wenn es bleibt, melde dich mit dieser Kennung: {error.digest ?? "unbekannt"}.</p>
      <button className="btn btn-primary" onClick={reset}>Erneut versuchen</button>
    </section>
  );
}
