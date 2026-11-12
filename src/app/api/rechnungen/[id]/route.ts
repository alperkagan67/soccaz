import { canUser } from "@/lib/roles";
import { loadInvoiceData } from "@/server/invoices";
import { renderInvoicePdf } from "@/server/invoice-pdf";
import { getCurrentUser } from "@/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rechnung als PDF. Vertrag 009 M2: nur Admin 1 (Hallen-Abruf erst mit 011, dann nur die eigene Halle). Fremde und unbekannte Rechnungen: gleiche Antwort. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rechnungen/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });
  if (!canUser(user, "finance") || !UUID.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const data = await loadInvoiceData(id);
  if (!data) return new Response("Nicht gefunden", { status: 404 });
  const pdf = await renderInvoicePdf(data);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
