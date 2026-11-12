export type Role = "player" | "admin" | "moderator" | "finance" | "booking";

export const ROLE_LABEL: Record<Role, string> = {
  player: "Spieler",
  admin: "Plattform-Admin",
  moderator: "Moderation",
  finance: "Finanzen",
  booking: "Hallen-Buchung",
};

export type Permission = "admin" | "moderation" | "finance" | "booking" | "dashboard" | "owner";

const GRANTS: Record<Role, Permission[]> = {
  player: [],
  // Admin 2 (Vertrag 009, Rollen): kein Finanzen, keine Provisionen/Einstellungen/Rollenverwaltung; die hat nur Admin 1 (users.is_owner, siehe OWNER_GRANTS)
  admin: ["admin", "moderation", "booking", "dashboard"],
  // Teilrollen entfallen mit Vertrag 009 M1 (Entscheid t9): die Migration setzt Konten auf player; die Enum-Werte bleiben, geben aber keine Rechte mehr
  moderator: [],
  finance: [],
  booking: [],
};

/** Zusätzlich zur Rolle admin hat Admin 1 (is_owner): Finanzen, Einstellungen, Rollenverwaltung, Absage-Entscheid. */
const OWNER_GRANTS: Permission[] = ["finance", "owner"];

/** Berechtigung nach Rolle allein (ohne Admin 1). Für Entscheidungen mit Nutzer: canUser. */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  return role ? GRANTS[role].includes(permission) : false;
}

/** Berechtigung eines Nutzers: Rolle plus, bei Admin 1 (role admin und is_owner), die Rechte aus OWNER_GRANTS. */
export function canUser(user: { role?: Role | null; isOwner?: boolean | null } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (can(user.role, permission)) return true;
  return isOwner(user) && OWNER_GRANTS.includes(permission);
}

/** Plattform-Admin = Rolle admin (Admin 1 und Admin 2). Admin 1 trägt weiter role = 'admin' (Vertrag 009 M1, docs/design/009-m1-plan.md), zusätzlich users.is_owner. */
export function isPlatformAdmin(user: { role?: Role | null } | null | undefined): boolean {
  return user?.role === "admin";
}

/** Admin 1 (Seitenbetreiber): genau ein Konto; Plattform-Admin mit users.is_owner. */
export function isOwner(user: { role?: Role | null; isOwner?: boolean | null } | null | undefined): boolean {
  return user?.role === "admin" && user.isOwner === true;
}

/** Rollen, die vergeben werden dürfen. moderator, finance und booking entfallen mit Vertrag 009 M1 (die Enum-Werte bleiben, werden aber nicht mehr vergeben). */
export const ASSIGNABLE_ROLES: Role[] = ["player", "admin"];
