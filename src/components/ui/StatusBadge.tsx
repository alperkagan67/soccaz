import type { ReactNode } from "react";

export type BadgeStatus = "ok" | "warn" | "danger" | "info" | "neutral";

// Symbol je Status: die Form trägt den Zustand mit, nicht nur die Farbe (Vertrag 013 AC-3, 012 AC-12)
const ICON: Record<BadgeStatus, string> = { ok: "✓", warn: "▲", danger: "✕", info: "i", neutral: "•" };

// Schrift in der Status-Farbe auf der Tönung (Kontrast je Thema im Test gemessen); Orange kommt nicht vor
const TONE: Record<BadgeStatus, string> = {
  ok: "border-ok bg-ok-soft text-ok",
  warn: "border-warn bg-warn-soft text-warn",
  danger: "border-danger bg-danger-soft text-danger",
  info: "border-info bg-info-soft text-info",
  neutral: "border-line bg-transparent text-muted",
};

type Own = {
  status: BadgeStatus;
  /** Das Wort des Zustands, vom Aufrufer nach `docs/design/begriffe.md` („Bereit“, „Karte hinterlegt“ …). Pflicht: nie nur Farbe. */
  label: string;
  /** Eigenes Symbol statt des Standards (kurz, ein Zeichen). */
  icon?: ReactNode;
  /** Der Betroffene selbst und der Captain sehen den echten Zustand. */
  viewer?: "self" | "captain";
};

type Third = {
  /** Dritte (andere Spieler, Gäste, Veranstalter) sehen nie den Zahlstatus eines Einzelnen (012 AC-12/AC-20). */
  viewer: "third";
  /** Neutraler Text für Dritte, z. B. „Zahlung ausstehend“ oder „Dabei“. Kein Name, kein bezahlt/offen. */
  thirdLabel: string;
  status?: never;
  label?: never;
  icon?: never;
};

export type StatusBadgeProps = Own | Third;

/**
 * Zustand als Symbol plus Wort plus Farbe (nie nur Farbe, nie nur Screenreader-Text).
 * Für Dritte (`viewer="third"`) immer neutral und ohne Zahlstatus: der Typ erlaubt dort weder `status` noch `label`.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const third = props.viewer === "third";
  const status: BadgeStatus = third ? "neutral" : props.status;
  const label = third ? props.thirdLabel : props.label;
  const icon = third ? ICON.neutral : (props.icon ?? ICON[status]);
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${TONE[status]}`}
    >
      <span aria-hidden="true" className="inline-flex w-3 justify-center">
        {icon}
      </span>
      <span>{label}</span>
    </span>
  );
}
