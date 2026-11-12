import type { Pool } from "pg";

export class SetOwnerError extends Error {
  code: "invalid_email" | "unknown_user" | "banned" | "other_owner";
  constructor(code: SetOwnerError["code"], message: string);
}
export function setOwner(db: Pool, email: string): Promise<{ status: "set" | "already"; userId: string }>;
