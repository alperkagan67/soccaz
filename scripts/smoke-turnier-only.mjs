// Rauchtest der Betriebsart TURNIER_ONLY gegen eine laufende Instanz (Produktion oder Staging). Nur lesende GET-Aufrufe ohne Anmeldung, keine Zugangsdaten, keine Schreibzugriffe.
// Aufruf:  node scripts/smoke-turnier-only.mjs <Adresse, z. B. https://soccaz.example>    Exit 0 = alle Prüfungen bestanden, 1 = mindestens eine nicht bestanden, 2 = falsche Benutzung.
// Erwartung bei TURNIER_ONLY=1: gesperrte Seiten antworten 200 mit "Kommt bald" und noindex (kein 404), Live-Kanäle 403, Turniere und Hilfe bleiben offen.

export const GESPERRTE_SEITEN = ["/spiele", "/matchmaking", "/suche", "/hallen", "/rangliste", "/mitspieler", "/ligen"];
export const OFFENE_SEITEN = ["/turniere", "/hilfe", "/impressum", "/teams"];
export const GESPERRTE_KANAELE = ["/api/spiele/stream"];

/** Wertet eine Antwort aus; reine Funktion (testbar ohne Netz). */
export function pruefeSeite(kind, status, body) {
  if (kind === "gesperrt") {
    if (status !== 200) return `Status ${status} statt 200 (die Ruheseite darf kein Fehler sein)`;
    if (!/Kommt bald/.test(body)) return 'Text "Kommt bald" fehlt';
    if (!/noindex/i.test(body)) return "noindex fehlt";
    return null;
  }
  if (kind === "offen") {
    if (status !== 200) return `Status ${status} statt 200`;
    if (/Kommt bald/.test(body) && /data-testid="kommt-bald"/.test(body)) return "zeigt fälschlich die Ruheseite";
    return null;
  }
  if (kind === "kanal") return status === 403 ? null : `Status ${status} statt 403`;
  return "unbekannte Art";
}

// Staging mit Zugangsschutz: SMOKE_BASIC_AUTH=<benutzer>:<passwort> nur aus der Umgebung (nie ausgeben)
async function holen(base, pfad) {
  const basic = process.env.SMOKE_BASIC_AUTH ?? "";
  const headers = { "user-agent": "socaz-smoke-turnier-only", ...(basic ? { Authorization: `Basic ${Buffer.from(basic).toString("base64")}` } : {}) };
  const res = await fetch(new URL(pfad, base), { redirect: "manual", headers });
  const body = res.headers.get("content-type")?.includes("text/event-stream") ? "" : await res.text();
  return { status: res.status, body };
}

export async function lauf(base) {
  const ergebnisse = [];
  const plan = [...GESPERRTE_SEITEN.map((p) => ["gesperrt", p]), ...OFFENE_SEITEN.map((p) => ["offen", p]), ...GESPERRTE_KANAELE.map((p) => ["kanal", p])];
  for (const [kind, pfad] of plan) {
    try {
      const { status, body } = await holen(base, pfad);
      const fehler = pruefeSeite(kind, status, body);
      ergebnisse.push({ kind, pfad, ok: fehler === null, fehler });
    } catch (e) {
      ergebnisse.push({ kind, pfad, ok: false, fehler: `nicht erreichbar (${e instanceof Error ? e.name : "Fehler"})` });
    }
  }
  return ergebnisse;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/").replace(/^\/+/, "")}`).href) {
  const base = process.argv[2];
  if (!base || !/^https?:\/\//.test(base)) {
    console.error("Aufruf: node scripts/smoke-turnier-only.mjs <Adresse, z. B. https://soccaz.example>");
    process.exit(2);
  }
  const erg = await lauf(base);
  for (const r of erg) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.kind.padEnd(8)} ${r.pfad}${r.fehler ? `: ${r.fehler}` : ""}`);
  const schlecht = erg.filter((r) => !r.ok).length;
  console.log(schlecht === 0 ? "ERGEBNIS: BESTANDEN" : `ERGEBNIS: NICHT BESTANDEN (${schlecht} von ${erg.length})`);
  process.exit(schlecht === 0 ? 0 : 1);
}
