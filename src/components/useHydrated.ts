"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Ist die Seite im Browser aktiv (hydriert)? Auf dem Server und beim ersten Zeichnen im Browser `false`, danach `true`.
 * Formulare mit eigenem Client-Handler (kein `action`, kein Progressive Enhancement) sperren damit ihren Absende-Knopf bis zur Hydration: ein Klick davor würde das Formular nativ als GET senden (Felder in
 * der Adresse, Aktion läuft nicht; Backlog 224). Ohne JavaScript bleibt der Knopf gesperrt (kein Datenleck, aber auch keine Aktion).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
