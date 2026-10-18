import { registerClick } from "@/server/sponsors";

/** Sponsoren-Klick: zählen, dann weiterleiten. Die Zieladresse steht nur in der Datenbank, nie in der Anfrage. */
export async function GET(_request: Request, ctx: RouteContext<"/api/sponsor/[id]">) {
  const url = await registerClick((await ctx.params).id);
  if (!url) return new Response("Nicht gefunden", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: url, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
