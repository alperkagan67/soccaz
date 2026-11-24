import type { Pool } from "pg";

/** Lauf des Staging-Seeds (scripts/staging-seed.mjs): wirft bei Verweigerung vor jedem Schreiben, gibt die Ausgabezeilen zurück. */
export function lauf(opts: { pool: Pool; env?: Record<string, string | undefined>; args?: string[] }): Promise<string[]>;
