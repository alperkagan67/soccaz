// Betreiber-Schritt: Admin 1 (Seitenbetreiber) festlegen. Aufruf: OWNER_EMAIL=<email> node scripts/set-owner.mjs --yes
// Die Datenbank kommt aus DATABASE_URL, das Konto aus OWNER_EMAIL (beides aus der Umgebung des Servers; der Wert steht nie im Repo und wird nie ausgegeben).
// Es muss ein BESTEHENDES Konto mit role = 'admin' sein. Ohne OWNER_EMAIL: nur wenn es genau ein admin-Konto gibt, sonst Abbruch.
// Lokal: node --env-file=.env.local scripts/set-owner.mjs --yes. Ohne --yes wird nur angezeigt, was passieren würde.
// Ablauf und Rollback: docs/BETRIEB.md, Abschnitt "Admin 1 festlegen". Logik und Tests: scripts/lib/set-owner.mjs.
import pg from "pg";
import { SetOwnerError, setOwner } from "./lib/set-owner.mjs";

const flags = process.argv.slice(2);
if (flags.some((f) => f !== "--yes")) {
  console.error("Aufruf: OWNER_EMAIL=<email> node scripts/set-owner.mjs --yes   (die E-Mail kommt nur aus der Umgebung)");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
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
const email = process.env.OWNER_EMAIL;
if (!flags.includes("--yes")) {
  console.log(`Trockenlauf: Admin 1 würde auf ${target} festgelegt (${email ? "Konto aus OWNER_EMAIL" : "OWNER_EMAIL nicht gesetzt: nur wenn es genau ein Admin-Konto gibt"}). Mit --yes ausführen.`);
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
