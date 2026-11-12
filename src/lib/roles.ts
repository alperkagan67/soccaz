export type Role = "player" | "admin" | "moderator" | "finance" | "booking";

export const ROLE_LABEL: Record<Role, string> = {
  player: "Spieler",
  admin: "Plattform-Admin",
  moderator: "Moderation",
  finance: "Finanzen",
  booking: "Hallen-Buchung",
};

export type Permission = "admin" | "moderation" | "finance" | "booking" | "dashboard";

const GRANTS: Record<Role, Permission[]> = {
  player: [],
  admin: ["admin", "moderation", "finance", "booking", "dashboard"],
  moderator: ["moderation", "dashboard"],
  finance: ["finance", "dashboard"],
  booking: ["booking", "dashboard"],
};

/** Plattform-Admins dürfen alles, die Teilrollen nur ihren Bereich. */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  return role ? GRANTS[role].includes(permission) : false;
}

/** Plattform-Admin = Rolle admin (Admin 1 und Admin 2). Admin 1 trägt weiter role = 'admin' (Vertrag 009 M1, docs/design/009-m1-plan.md), zusätzlich users.is_owner. */
export function isPlatformAdmin(user: { role?: Role | null } | null | undefined): boolean {
  return user?.role === "admin";
}

/** Admin 1 (Seitenbetreiber): genau ein Konto; Plattform-Admin mit users.is_owner. */
export function isOwner(user: { role?: Role | null; isOwner?: boolean | null } | null | undefined): boolean {
  return user?.role === "admin" && user.isOwner === true;
}

export const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[];
