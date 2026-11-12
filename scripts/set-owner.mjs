// Betreiber-Schritt: Admin 1 (Seitenbetreiber) festlegen. Aufruf: node scripts/set-owner.mjs <email> --yes
// Die Datenbank kommt aus DATABASE_URL der Umgebung (lokal: node --env-file=.env.local scripts/set-owner.mjs <email> --yes). Ohne --yes wird nur angezeigt, was passieren würde.
// Ablauf und Rollback: docs/BETRIEB.md, Abschnitt "Admin 1 festlegen". Logik und Tests: scripts/lib/set-owner.mjs.
import pg from "pg";
import { SetOwnerError, setOwner } from "./lib/set-owner.mjs";

const [email, ...flags] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!email || email.startsWith("--")) {
  console.error("Aufruf: node scripts/set-owner.mjs <email> --yes");
  process.exit(2);
}
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(2);
}
// Nur Host, Port und Datenbankname anzeigen, nie Benutzer oder Passwort
let target = "unbekannt";
try {
  const u = new URL(url);
  target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
} catch {
  /* bleibt "unbekannt" */
}
if (!flags.includes("--yes")) {
  console.log(`Trockenlauf: Admin 1 würde auf ${target} für ${email} festgelegt. Mit --yes ausführen.`);
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const result = await setOwner(pool, email);
  console.log(result.status === "set" ? `Admin 1 festgelegt (${target}).` : `Unverändert: dieses Konto ist schon Admin 1 (${target}).`);
} catch (error) {
  if (error instanceof SetOwnerError) {
    console.error(`Abbruch (${error.code}): ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
