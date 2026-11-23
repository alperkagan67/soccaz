"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { decideMotion } from "@/lib/reveal-motion";
import type { Tier } from "@/lib/rating";

// Karten-Aufdecken und Aufstieg (Vertrag 013 v3, AC-20 bis AC-23). Kleinste mögliche Client-Insel: sie bekommt die schon sichtbaren Angaben (Stufe, Richtung) und die Kinder (Server-Markup)
// und setzt nur Klassen/Attribute für das CSS. Ohne JavaScript steht alles im Endzustand da; die Information steht immer auch als Text in den Kindern.
// Animiert wird in globals.css (nur transform und opacity, will-change nur während der Animation).
export function RevealMotion({ afterTier, direction, children }: { afterTier: Tier; direction: "up" | "same" | "down"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null; // Speicher gesperrt (privater Modus, blockierte Website-Daten): nie feiern, kein Fehler
    }
    const { celebrate } = decideMotion(storage, afterTier, direction);
    if (celebrate) el.dataset.celebrate = "true";
    // Erwartete Animationen: das Aufdecken der Karte und (nur bei der Feier und ohne reduzierte Bewegung) der Chip-Pop. Erst wenn alle fertig sind, fällt will-change weg.
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let open = celebrate && !reduced ? 2 : 1;
    el.classList.add("is-animating");
    const onEnd = () => {
      open -= 1;
      if (open <= 0) {
        el.classList.remove("is-animating"); // will-change nur während der Animation
        el.removeEventListener("animationend", onEnd);
        el.removeEventListener("animationcancel", onEnd);
      }
    };
    el.addEventListener("animationend", onEnd);
    el.addEventListener("animationcancel", onEnd);
    return () => {
      el.removeEventListener("animationend", onEnd);
      el.removeEventListener("animationcancel", onEnd);
    };
  }, [afterTier, direction]);
  return (
    <div ref={ref} data-testid="reveal-motion" className="reveal-motion">
      {children}
    </div>
  );
}
