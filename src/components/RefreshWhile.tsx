"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Lädt die Seite alle paar Sekunden neu, solange etwas aussteht (z. B. eine Zahlung, die der Anbieter noch bestätigt). */
export function RefreshWhile({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
