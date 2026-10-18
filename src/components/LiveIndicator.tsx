"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Hört auf Änderungen (SSE) und lädt die Seite neu. Zusätzlich alle 30 Sekunden als Absicherung. */
export function LiveIndicator({ eventsUrl }: { eventsUrl: string }) {
  const router = useRouter();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const source = new EventSource(eventsUrl);
    source.onopen = () => setOnline(true);
    source.onerror = () => setOnline(false);
    source.addEventListener("update", () => router.refresh());
    const poll = setInterval(() => router.refresh(), 30_000);
    return () => {
      source.close();
      clearInterval(poll);
    };
  }, [eventsUrl, router]);

  return (
    <span className={`text-xs ${online ? "text-green" : "text-muted"}`} title={online ? "Live verbunden" : "Verbinde…"}>
      {online ? "● Live" : "○ Verbinde…"}
    </span>
  );
}
