import { matchCard } from "@/server/cards";

/** Spielbericht-Karte zum Herunterladen und Teilen. */
export async function GET(_request: Request, ctx: RouteContext<"/api/karte/[id]">) {
  const image = await matchCard((await ctx.params).id);
  const headers = new Headers(image.headers);
  headers.set("Content-Disposition", 'attachment; filename="socaz-spielbericht.png"');
  return new Response(image.body, { headers });
}
