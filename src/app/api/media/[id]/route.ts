import { getMedia, removeMedia } from "@/server/media";
import { getCurrentUser } from "@/server/session";
import { DomainError } from "@/server/teams";

export async function GET(_request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  // Bilder nur für Angemeldete (Entscheid t2q 2026-11-24, Backlog 243): ohne Anmeldung dieselbe Antwort wie bei einem unbekannten Bild (kein Existenz-Orakel)
  const user = await getCurrentUser();
  const row = user ? await getMedia(id) : null;
  if (!row) return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=31536000, immutable", // nur im Browser des Angemeldeten, nie in gemeinsamen Caches (CDN); jedes Bild hat eine eigene ID, Änderungen bekommen eine neue
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Bitte melde dich an." }, { status: 401 });
  try {
    await removeMedia({ id: user.id, role: user.role }, (await ctx.params).id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
