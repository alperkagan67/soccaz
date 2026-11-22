// Aufruf: node scripts/verify-evidence-chain.mjs <beweiskette.ndjson> [erwarteter-kopf-hash] [erwartete-anzahl]
// Prueft den Gesamtketten-Export aus /api/beweis/kette ohne Datenbank (Exit 0 = Kette gueltig, 1 = Abweichung). Kopf-Hash und Anzahl stammen aus der EXTERNEN Kopie (Benachrichtigung/Ablage).
import { readFileSync } from "node:fs";
import { verifyNdjson } from "./lib/evidence-chain.mjs";

const [file, head, count] = process.argv.slice(2);
if (!file) {
  console.error("Aufruf: node scripts/verify-evidence-chain.mjs <beweiskette.ndjson> [kopf-hash] [anzahl]");
  process.exit(2);
}
const r = verifyNdjson(readFileSync(file, "utf8"), { headHash: head, count: count === undefined ? undefined : Number(count) });
console.log(r.ok ? `Kette gueltig: ${r.count} Eintraege, Kopf-Hash ${r.headHash || "(leer)"}` : `ABWEICHUNG ab Nr. ${r.firstBadSeq} (${r.reason}); Eintraege: ${r.count}`);
process.exit(r.ok ? 0 : 1);
