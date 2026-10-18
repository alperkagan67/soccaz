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

export const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[];
