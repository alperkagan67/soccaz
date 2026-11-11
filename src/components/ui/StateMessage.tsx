import { Button } from "./Button";
import { LinkButton } from "./LinkButton";

export type StateKind = "empty" | "error" | "ended" | "forbidden";

/** Genau eine nächste Handlung: Link (`href`) oder Handler (`onClick`, nur aus einer Client-Komponente). */
export type StateAction = { label: string } & ({ href: string } | { onClick: () => void });

export type StateMessageProps = {
  kind: StateKind;
  /** Was ist los? Kurz, ohne Fachwort. */
  title: string;
  /** Warum? Genau ein Satz. */
  reason: string;
  /** Pflicht: ohne nächsten Schritt gibt es keinen Zustand (Vertrag 013 AC-7). */
  action: StateAction;
};

// Symbol und Rahmenfarbe je Art; das Wort steht im Titel, die Farbe kommt nur dazu
const KIND: Record<StateKind, { icon: string; tone: string }> = {
  empty: { icon: "○", tone: "border-line" },
  error: { icon: "✕", tone: "border-danger" },
  ended: { icon: "■", tone: "border-line" },
  forbidden: { icon: "▲", tone: "border-warn" },
};

/**
 * Leer-, Fehler-, Beendet- und Gesperrt-Zustand: Titel, ein Satz Grund und genau eine nächste Handlung.
 * `error` ist ein `role="alert"`, die anderen Arten ein `role="status"`.
 */
export function StateMessage({ kind, title, reason, action }: StateMessageProps) {
  const k = KIND[kind];
  return (
    <section role={kind === "error" ? "alert" : "status"} data-kind={kind} className={`card space-y-3 border-2 ${k.tone}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 inline-flex w-5 justify-center text-lg font-bold">
          {k.icon}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold">{title}</p>
          <p className="text-muted">{reason}</p>
        </div>
      </div>
      {"href" in action ? (
        <LinkButton variant="primary" href={action.href}>{action.label}</LinkButton>
      ) : (
        <Button variant="primary" onClick={action.onClick}>{action.label}</Button>
      )}
    </section>
  );
}
