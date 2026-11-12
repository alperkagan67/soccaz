// Admin 1 festlegen (Vertrag 009 M1, docs/design/009-m1-plan.md Abschnitt 6): setzt is_owner für genau ein BESTEHENDES Konto mit role = 'admin'.
// Das Konto kommt aus der Umgebungsvariable OWNER_EMAIL (Wert nie im Repo). Ohne Angabe wird nur gehandelt, wenn es genau EIN nicht gesperrtes admin-Konto gibt;
// bei mehreren bricht das Skript ab (keine Raterei). Idempotent, bricht ab, wenn schon ein ANDERES Konto Admin 1 ist, das Konto fehlt, kein admin oder gesperrt ist.
// Schreibt einen Protokolleintrag ohne Akteur (actor_id leer = Betreiber-Schritt außerhalb der App; das Feld "reason" kommt erst mit E2, bis dahin steht der Grund in "after").
// Kein Zugriff auf Umgebungsdateien hier: die Verbindung und die E-Mail kommen vom Aufrufer.

export class SetOwnerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {import("pg").Pool} db  Verbindungspool
 * @param {string | null | undefined} email  E-Mail des Admin-Kontos (OWNER_EMAIL); leer = nur wenn es genau ein admin-Konto gibt
 * @returns {Promise<{ status: "set" | "already", userId: string }>}
 */
export async function setOwner(db, email) {
  const address = String(email ?? "").trim().toLowerCase();
  if (address && !address.includes("@")) throw new SetOwnerError("invalid_email", "OWNER_EMAIL ist keine E-Mail-Adresse.");
  const client = await db.connect();
  try {
    await client.query("begin");
    try {
      // Eine Sperre für alle Aufrufe, damit zwei gleichzeitige Aufrufe nicht beide "kein Admin 1" sehen (der Teilindex fängt es zusätzlich ab)
      await client.query("select pg_advisory_xact_lock(hashtextextended('set-owner', 0))");
      let user;
      if (address) {
        const { rows } = await client.query("select id, role, is_owner, banned_at from users where lower(email) = $1 for update", [address]);
        if (rows.length === 0) throw new SetOwnerError("unknown_user", "Dieses Konto gibt es nicht. Das Konto muss sich vorher einmal angemeldet haben.");
        user = rows[0];
        if (user.banned_at) throw new SetOwnerError("banned", "Das Konto ist gesperrt.");
        if (user.role !== "admin") throw new SetOwnerError("not_admin", "Das Konto ist kein Admin-Konto (role admin). Abbruch, nichts geändert.");
      } else {
        const { rows } = await client.query("select id, role, is_owner, banned_at from users where role = 'admin' and banned_at is null for update");
        if (rows.length === 0) throw new SetOwnerError("no_admin", "Es gibt kein Admin-Konto. OWNER_EMAIL angeben.");
        if (rows.length > 1) throw new SetOwnerError("ambiguous", `Es gibt ${rows.length} Admin-Konten. OWNER_EMAIL angeben (keine Raterei).`);
        user = rows[0];
      }
      const other = await client.query("select id from users where is_owner and id <> $1 limit 1", [user.id]);
      if (other.rows.length > 0) throw new SetOwnerError("other_owner", "Es gibt schon einen Admin 1. Abbruch, nichts geändert.");
      if (user.is_owner) {
        await client.query("commit");
        return { status: "already", userId: user.id };
      }
      await client.query("update users set is_owner = true where id = $1", [user.id]);
      await client.query(
        "insert into audit_log (actor_id, action, entity, entity_id, before, after) values (null, 'user.owner_set', 'user', $1, $2, $3)",
        [user.id, JSON.stringify({ role: user.role, isOwner: false }), JSON.stringify({ role: "admin", isOwner: true, via: "set-owner", reason: "Betreiber-Schritt: Admin 1 festgelegt" })],
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
