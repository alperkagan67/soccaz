"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

/** Nur für die Showcase: beweist, dass Tastatur (Enter, Leertaste) und Klick auslösen. */
export function Counter() {
  const [n, setN] = useState(0);
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" onClick={() => setN((v) => v + 1)} data-testid="counter-button">
        Zählen
      </Button>
      <IconButton label="Zurücksetzen" icon="↺" onClick={() => setN(0)} data-testid="counter-reset" />
      <Button pending={pending} onClick={() => setPending(true)} data-testid="counter-pending">
        Speichern
      </Button>
      <p role="status" data-testid="counter-value" className="text-sm">Ausgelöst: {n}</p>
    </div>
  );
}
