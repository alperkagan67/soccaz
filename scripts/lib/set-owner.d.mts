import type { Pool } from "pg";

export class SetOwnerError extends Error {
  code: "invalid_email" | "unknown_user" | "banned" | "not_admin" | "no_admin" | "ambiguous" | "other_owner";
  constructor(code: SetOwnerError["code"], message: string);
}
export function setOwner(db: Pool, email?: string | null): Promise<{ status: "set" | "already"; userId: string }>;
