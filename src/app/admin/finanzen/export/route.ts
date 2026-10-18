import { can } from "@/lib/roles";
import { currentMonth, exportLedgerCsv, monthPeriod } from "@/server/finance";
import { getCurrentUser } from "@/server/session";

/** Buchungsjournal eines Monats als CSV (Semikolon, Dezimalkomma, UTF-8 mit BOM) für den Steuerberater. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "finance")) return new Response("Verboten", { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get("monat") ?? currentMonth();
  const period = monthPeriod(month);
  if (!period) return new Response("Ungültiger Monat (erwartet JJJJ-MM)", { status: 400 });

  const csv = await exportLedgerCsv(period);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="socaz-buchungen-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
