// Erzeugt das "Client Secret" für die Anmeldung mit Apple: ein selbst signiertes JWT (ES256). Läuft LOKAL auf dem eigenen Rechner, nie im Chat.
// Aufruf:  node scripts/apple-client-secret.mjs <Pfad-zur-.p8-Datei>
// Umgebung (Kennungen, keine Geheimnisse): APPLE_TEAM_ID (10 Zeichen), APPLE_KEY_ID (10 Zeichen), AUTH_APPLE_ID (Services ID).
// Ausgabe: auf stdout NUR das JWT (eine Zeile), auf stderr das Ablaufdatum. Der Schlüssel wird nie ausgegeben und nie ins Repository, in ein Log oder eine Fehlermeldung geschrieben.
// Gültigkeit: höchstens 6 Monate (Apple-Grenze 15777000 s); Standard 180 Tage, Erneuerung spätestens alle 5 Monate (docs/design/apple-anmeldung-anleitung.md, Abschnitt 6).
// Exit 0 = ok, 1 = Fehler (ohne Schlüsselinhalt), 2 = falsche Benutzung.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_GUELTIGKEIT_SEKUNDEN = 15_777_000;
export const STANDARD_GUELTIGKEIT_SEKUNDEN = 180 * 24 * 3600;
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
const KENNUNG = /^[A-Za-z0-9]{10}$/;

/** Reine Funktion: baut das JWT. Wirft Error mit Text OHNE Schlüsselinhalt. */
export function buildClientSecret({ teamId, keyId, clientId, privateKeyPem, now = Math.floor(Date.now() / 1000), gueltigkeit = STANDARD_GUELTIGKEIT_SEKUNDEN }) {
  if (!KENNUNG.test(teamId ?? "")) throw new Error("APPLE_TEAM_ID fehlt oder hat nicht 10 Zeichen (Buchstaben/Ziffern).");
  if (!KENNUNG.test(keyId ?? "")) throw new Error("APPLE_KEY_ID fehlt oder hat nicht 10 Zeichen (Buchstaben/Ziffern).");
  if (typeof clientId !== "string" || clientId.length < 3) throw new Error("AUTH_APPLE_ID (Services ID) fehlt.");
  if (!Number.isInteger(gueltigkeit) || gueltigkeit <= 0 || gueltigkeit > MAX_GUELTIGKEIT_SEKUNDEN) throw new Error(`Gültigkeit muss zwischen 1 und ${MAX_GUELTIGKEIT_SEKUNDEN} Sekunden liegen (höchstens 6 Monate).`);
  let key;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("Die Schlüsseldatei ist kein gültiger privater Schlüssel (erwartet: .p8 von Apple).");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("Der Schlüssel ist kein EC-Schlüssel der Kurve P-256 (Apple-.p8).");
  const kopf = { alg: "ES256", kid: keyId, typ: "JWT" };
  const nutzlast = { iss: teamId, iat: now, exp: now + gueltigkeit, aud: "https://appleid.apple.com", sub: clientId };
  const eingabe = `${b64(kopf)}.${b64(nutzlast)}`;
  const signatur = sign("sha256", Buffer.from(eingabe), { key, dsaEncoding: "ieee-p1363" });
  return { jwt: `${eingabe}.${signatur.toString("base64url")}`, exp: nutzlast.exp };
}

function main() {
  const pfad = process.argv[2];
  if (!pfad) {
    console.error("Aufruf: node scripts/apple-client-secret.mjs <Pfad-zur-.p8-Datei>   (Umgebung: APPLE_TEAM_ID, APPLE_KEY_ID, AUTH_APPLE_ID)");
    process.exit(2);
  }
  let pem;
  try {
    pem = readFileSync(pfad, "utf8");
  } catch {
    console.error("Die Schlüsseldatei konnte nicht gelesen werden (Pfad prüfen).");
    process.exit(1);
  }
  try {
    const { jwt, exp } = buildClientSecret({ teamId: process.env.APPLE_TEAM_ID, keyId: process.env.APPLE_KEY_ID, clientId: process.env.AUTH_APPLE_ID, privateKeyPem: pem });
    process.stdout.write(jwt + "\n");
    console.error(`Gültig bis ${new Date(exp * 1000).toISOString().slice(0, 10)} (Erinnerung nach 5 Monaten setzen; Datum in docs/BETRIEB.md eintragen).`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Fehler");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
