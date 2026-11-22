import { canUser } from "@/lib/roles";
import { loadMatchEvidence } from "@/server/evidence-export";
import { renderEvidencePdf } from "@/server/evidence-pdf";
import { getCurrentUser } from "@/server/session";

/**
 * Beweisprotokoll eines Spiels als PDF (Vertrag 009 M3c). NUR Admin 1 (owner), im Handler geprüft; Admin 2, Betreiber, Spieler, Gäste, unbekannte und ungültige IDs bekommen dieselbe
 * 404-Antwort. Kein Cache, Dateiname ohne Personenbezug. Hallen-Abruf erst mit 011 M3 (nur eigene Halle, nie Spielernamen).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/beweis/[matchId]">) {
  const { matchId } = await ctx.params;
  const user = await getCurrentUser();
  const notFound = () => new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!user || !canUser(user, "owner")) return notFound();
  const data = await loadMatchEvidence(matchId);
  if (!data) return notFound();
  const pdf = await renderEvidencePdf(data);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="beweis-${data.number ?? "spiel"}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
