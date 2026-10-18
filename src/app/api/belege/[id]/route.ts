import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matches, teams, users } from "@/db/schema";
import { can } from "@/lib/roles";
import { formatDateTime } from "@/lib/time";
import { renderReceiptPdf } from "@/server/receipt-pdf";
import { getReceipt } from "@/server/receipts";
import { getCurrentUser } from "@/server/session";

/** Beleg als PDF. Nur für den Besitzer und für die Finanz-Rolle. */
export async function GET(_request: Request, ctx: RouteContext<"/api/belege/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });

  const receipt = await getReceipt(id);
  if (!receipt || (receipt.userId !== user.id && !can(user.role, "finance"))) return new Response("Nicht gefunden", { status: 404 });

  const [customer] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, receipt.userId));
  const details: { label: string; value: string }[] = [];
  let description = "Guthaben-Aufladung";

  if (receipt.kind === "match" && receipt.matchId) {
    const home = alias(teams, "home");
    const away = alias(teams, "away");
    const [m] = await db
      .select({ startsAt: matches.startsAt, durationMin: matches.durationMin, venueText: matches.venueText, homeName: home.name, awayName: away.name })
      .from(matches)
      .innerJoin(home, eq(home.id, matches.homeTeamId))
      .innerJoin(away, eq(away.id, matches.awayTeamId))
      .where(eq(matches.id, receipt.matchId));
    if (m) {
      description = `Startgebühr: ${m.homeName} gegen ${m.awayName}`;
      details.push({ label: "Spiel", value: `${formatDateTime(m.startsAt)} Uhr, ${m.durationMin} Minuten` });
      if (m.venueText) details.push({ label: "Ort", value: m.venueText });
    }
  }

  const pdf = await renderReceiptPdf({
    number: receipt.number,
    issuedAt: receipt.issuedAt,
    kind: receipt.kind as "topup" | "match",
    amountCents: receipt.amountCents,
    customerName: customer?.name ?? "",
    customerEmail: customer?.email ?? "",
    description,
    details,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receipt.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
