export type NotificationType =
  | "request.accepted"
  | "request.challenge"
  | "player.request"
  | "team.joined"
  | "lobby.joined"
  | "lobby.substitute"
  | "match.confirmed"
  | "match.cancelled"
  | "match.reminder"
  | "result.confirm"
  | "result.reminder"
  | "result.disputed"
  | "result.final"
  | "admin.task"
  | "payment"
  | "system";

/** Beschreibung jeder Benachrichtigungsart: Anzeigename, ob zusätzlich eine E-Mail rausgeht, ob sie abschaltbar ist. */
export const NOTIFICATION_TYPES: Record<NotificationType, { label: string; email: boolean; optional: boolean }> = {
  "request.accepted": { label: "Deine Spielsuche wurde angenommen", email: true, optional: true },
  "player.request": { label: "Ein Team fragt dich als Mitspieler an", email: true, optional: true },
  "request.challenge": { label: "Dein Team wurde herausgefordert", email: true, optional: true },
  "team.joined": { label: "Neues Mitglied in deinem Team", email: false, optional: true },
  "lobby.joined": { label: "Spieler tritt der Lobby bei", email: false, optional: true },
  "lobby.substitute": { label: "Ersatzspieler wartet auf Zuweisung", email: false, optional: true },
  "match.confirmed": { label: "Spiel bestätigt", email: true, optional: true },
  "match.cancelled": { label: "Spiel abgesagt", email: true, optional: false },
  "match.reminder": { label: "Erinnerung vor dem Anstoß", email: false, optional: true },
  "result.confirm": { label: "Ergebnis zur Bestätigung", email: true, optional: false },
  "result.reminder": { label: "Erinnerung: Ergebnis bestätigen", email: true, optional: false },
  "result.disputed": { label: "Ergebnis strittig", email: true, optional: false },
  "result.final": { label: "Endergebnis", email: false, optional: true },
  "admin.task": { label: "Neue Aufgabe für Admins", email: false, optional: true },
  payment: { label: "Zahlungen und Guthaben", email: true, optional: false },
  system: { label: "Wichtige Hinweise", email: true, optional: false },
};

export function isOptionalType(type: string): boolean {
  return NOTIFICATION_TYPES[type as NotificationType]?.optional ?? true;
}

export function emailsFor(type: string): boolean {
  return NOTIFICATION_TYPES[type as NotificationType]?.email ?? false;
}
