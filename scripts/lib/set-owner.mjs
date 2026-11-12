// Admin 1 festlegen (Vertrag 009 M1, docs/design/009-m1-plan.md Abschnitt 6): setzt role = 'admin' und is_owner für genau ein Konto.
// Idempotent (zweiter Aufruf für dasselbe Konto ändert nichts), bricht ab, wenn schon ein ANDERES Konto Admin 1 ist, das Konto fehlt oder gesperrt ist.
// Schreibt einen Protokolleintrag ohne Akteur (actor_id leer = Betreiber-Schritt außerhalb der App; das Feld "reason" kommt erst mit E2, bis dahin steht der Grund in "after").
// Kein Zugriff auf Umgebungsdateien hier: die Verbindung kommt vom Aufrufer.

export class SetOwnerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {import("pg").Pool} db  Verbindungspool
 * @param {string} email  E-Mail des Kontos, das Admin 1 werden soll
 * @returns {Promise<{ status: "set" | "already", userId: string }>}
 */
export async function setOwner(db, email) {
  const address = String(email ?? "").trim().toLowerCase();
  if (!address || !address.includes("@")) throw new SetOwnerError("invalid_email", "Bitte eine E-Mail-Adresse angeben.");
  const client = await db.connect();
  try {
    await client.query("begin");
    try {
      // Sperre auf die Zeilen mit is_owner, damit zwei gleichzeitige Aufrufe nicht beide "kein Owner" sehen (der Teilindex fängt es zusätzlich ab)
      await client.query("select pg_advisory_xact_lock(hashtextextended('set-owner', 0))");
      const { rows } = await client.query("select id, role, is_owner, banned_at from users where lower(email) = $1 for update", [address]);
      if (rows.length === 0) throw new SetOwnerError("unknown_user", "Dieses Konto gibt es nicht. Das Konto muss sich vorher einmal angemeldet haben.");
      const user = rows[0];
      if (user.banned_at) throw new SetOwnerError("banned", "Das Konto ist gesperrt.");
      const other = await client.query("select id from users where is_owner and id <> $1 limit 1", [user.id]);
      if (other.rows.length > 0) throw new SetOwnerError("other_owner", "Es gibt schon einen Admin 1. Abbruch, nichts geändert.");
      if (user.is_owner && user.role === "admin") {
        await client.query("commit");
        return { status: "already", userId: user.id };
      }
      await client.query("update users set role = 'admin', is_owner = true where id = $1", [user.id]);
      await client.query(
        "insert into audit_log (actor_id, action, entity, entity_id, before, after) values (null, 'user.owner_set', 'user', $1, $2, $3)",
        [user.id, JSON.stringify({ role: user.role, isOwner: user.is_owner }), JSON.stringify({ role: "admin", isOwner: true, via: "set-owner", reason: "Betreiber-Schritt: Admin 1 festgelegt" })],
      );
      await client.query("commit");
      return { status: "set", userId: user.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    client.release();
  }
}
