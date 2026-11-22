import { canUser } from "@/lib/roles";
import { exportEvidenceChainStream } from "@/server/evidence-export";
import { getCurrentUser } from "@/server/session";

/**
 * Gesamtketten-Export (NDJSON) für die externe Prüfung (Plan 009 M3, 12 e): nur Admin 1, im Handler geprüft, sonst 404. Ohne Personenfelder (nur die Felder des Hashes).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUser(user, "owner")) return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(exportEvidenceChainStream(), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": 'attachment; filename="beweiskette.ndjson"', "Cache-Control": "private, no-store" },
  });
}
