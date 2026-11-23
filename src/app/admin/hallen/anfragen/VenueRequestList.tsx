"use client";

// Liste der offenen Hallen-Anfragen (013 v3 AC-31, Nacharbeit R-T: Rückfrage, Erfolgsmeldung, Namen). Freischalten und Ablehnen laufen über den ConfirmDialog; die Server-Aktionen
// prüfen das Recht selbst (Wächter booking + Funktion). EIN Statusbereich über der Liste (role=status) bekommt nach Erfolg den Fokus: die Zeile samt Auslöser ist dann weg.
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionState } from "@/lib/validation";

export type VenueRequestRow = { id: string; name: string; city: string; address: string | null; surface: string | null; contact: string | null; requestedLabel: string | null };

type Notice = { kind: "ok" | "error"; text: string };

/** Die Server-Aktionen kommen von der Seite (Props, Namen auf `Action`): so bleibt die Liste ohne Server-Importe testbar. */
export function VenueRequestList({ requests, approveAction, rejectAction }: { requests: readonly VenueRequestRow[]; approveAction: (venueId: string) => Promise<ActionState>; rejectAction: (venueId: string, reason: string) => Promise<ActionState> }) {
  const status = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);

  // Eine Fehlermeldung wie "schon entschieden": die Seite lädt neu, die Zeile samt Dialog verschwindet; die Meldung steht dann im Statusbereich (abgeleitet, kein Zustand im Effekt).
  const goneError = failed && !requests.some((r) => r.id === failed.id) ? failed.text : null;
  const shown: Notice | null = goneError ? { kind: "error", text: goneError } : notice;
  useEffect(() => {
    if (goneError) status.current?.focus();
  }, [goneError]);

  async function decide(r: VenueRequestRow, kind: "approve" | "reject", reason = ""): Promise<ActionState> {
    const result = kind === "approve" ? await approveAction(r.id) : await rejectAction(r.id, reason);
    setFailed(null);
    if (result?.error) {
      setFailed({ id: r.id, text: result.error });
    } else if (result?.ok) {
      setNotice({ kind: "ok", text: kind === "approve" ? `Halle „${r.name}“ freigeschaltet.` : `Halle „${r.name}“ abgelehnt.` });
    }
    return result;
  }

  const focusStatus = () => status.current;

  return (
    <>
      <div ref={status} role="status" tabIndex={-1} className="outline-none ui-focus rounded-lg" data-testid="requests-status">
        {shown && (
          <p className={shown.kind === "error" ? "error" : "card text-sm"} role={shown.kind === "error" ? "alert" : undefined} data-testid={shown.kind === "ok" ? "requests-done" : "requests-error"}>
            {shown.text}
          </p>
        )}
      </div>
      {requests.length === 0 ? (
        <p className="card text-sm text-muted" data-testid="requests-empty">
          Keine offenen Anfragen.
        </p>
      ) : (
        <ul className="space-y-4" data-testid="requests-list">
          {requests.map((r) => (
            <li key={r.id} className="card space-y-3" data-testid={`request-${r.id}`}>
              <div>
                <h2 className="font-semibold">
                  {r.name} <span className="font-normal text-muted">· {r.city}</span>
                </h2>
                <p className="text-sm text-muted">{[r.address, r.surface, r.contact].filter(Boolean).join(" · ") || "Keine weiteren Angaben"}</p>
                {r.requestedLabel && <p className="text-xs text-muted">Angefragt am {r.requestedLabel}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <ConfirmDialog
                  trigger={{
                    label: (
                      <>
                        Freischalten<span className="sr-only"> Halle {r.name}</span>
                      </>
                    ),
                    variant: "primary",
                  }}
                  title={`Halle „${r.name}“ freischalten?`}
                  body="Die Halle wird für alle sichtbar und buchbar. Der Betreiber bekommt eine Mitteilung."
                  consequence="Die Freischaltung lässt sich nicht zurücknehmen."
                  confirmLabel="Halle freischalten"
                  focusAfterSuccessAction={focusStatus}
                  onConfirmAction={() => decide(r, "approve")}
                />
                <ConfirmDialog
                  trigger={{
                    label: (
                      <>
                        Ablehnen<span className="sr-only"> Halle {r.name}</span>
                      </>
                    ),
                  }}
                  title={`Halle „${r.name}“ ablehnen?`}
                  body="Der Betreiber bekommt den Grund mitgeteilt und kann die Anfrage nach einer Änderung erneut senden."
                  confirmLabel="Halle ablehnen"
                  danger
                  field={{ label: "Grund der Ablehnung", minLength: 3, maxLength: 200, hint: "Pflicht, 3 bis 200 Zeichen. Der Betreiber sieht den Text." }}
                  focusAfterSuccessAction={focusStatus}
                  onConfirmAction={({ value }) => decide(r, "reject", value)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
