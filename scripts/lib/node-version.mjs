// Mindestversion von Node (reine Funktionen, keine Pakete, keine Eingabe aus dem Netz). Die Grenzen stehen NUR hier; package.json (engines) und .nvmrc werden von
// tests/unit/node-version.test.ts dagegen geprüft.
//
// Warum 22.13: Tailwind 4 (@tailwindcss/node) wird beim Start von Next per require() geladen und ist ein ES-Modul. require() von ES-Modulen läuft in Node 22 erst ab 22.12.0 ohne Flag
// (Node-Doku, Verlauf "require(esm)": v22.12.0 und v20.19.0 ohne Flag, ab v22.13.0 ohne Experimental-Warnung); in 22.9.0 bricht es mit ERR_REQUIRE_ESM ab. Außerdem verlangt
// eslint-visitor-keys 5.0.1 (über ESLint) Node ^20.19.0 || ^22.13.0 || >=24. Die kleinste Version, die beides erfüllt, ist 22.13.0.
// Obergrenze: Node 23 ist nicht getestet und kein LTS (vitest verlangt ^22 oder >=24); Node 24 ist ebenfalls nicht getestet.
export const MIN_VERSION = { major: 22, minor: 13 };
export const MAX_MAJOR_EXCLUSIVE = 23;

/** "v22.9.0" oder "22.9.0" -> { major, minor, patch }; null bei etwas anderem. */
export function parseNodeVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? "").trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

/** Erfüllt diese Version die Mindestanforderung (>= 22.13.0 und < 23)? */
export function nodeVersionOk(text) {
  const v = parseNodeVersion(text);
  if (!v) return false;
  if (v.major >= MAX_MAJOR_EXCLUSIVE) return false;
  if (v.major !== MIN_VERSION.major) return v.major > MIN_VERSION.major && v.major < MAX_MAJOR_EXCLUSIVE;
  return v.minor >= MIN_VERSION.minor;
}

/** Deutsche Meldung für eine unpassende Version (leer, wenn alles passt). */
export function nodeVersionMessage(text) {
  if (nodeVersionOk(text)) return "";
  const min = `${MIN_VERSION.major}.${MIN_VERSION.minor}`;
  return [
    `Node >=${min} und <${MAX_MAJOR_EXCLUSIVE} nötig, gefunden ${String(text ?? "unbekannt").replace(/^v/, "")}.`,
    `So beheben: Node ${min} (oder neuer, aber noch Version 22) installieren, zum Beispiel mit "nvm install ${min}" und "nvm use" (die Datei .nvmrc nennt die Version),`,
    "oder von https://nodejs.org die 22er LTS-Version laden. Danach ein neues Terminal öffnen und mit \"node -v\" prüfen.",
    "Hintergrund: ältere 22er (zum Beispiel 22.9) können ES-Module nicht per require() laden (Tailwind 4 bricht mit ERR_REQUIRE_ESM ab).",
  ].join("\n");
}
