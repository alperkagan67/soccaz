import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, storeImage } from "@/server/media";
import { getCurrentUser } from "@/server/session";
import { DomainError } from "@/server/teams";

const fields = z.object({ kind: z.enum(["avatar", "team_logo", "match_photo"]), refId: z.string().uuid() });

/** Bild hochladen (multipart). Nur von der eigenen Seite aus, mit Anmeldung. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Bitte melde dich an." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 100_000) return NextResponse.json({ error: "Das Bild ist größer als 5 MB." }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const parsed = fields.safeParse({ kind: form?.get("kind"), refId: form?.get("refId") });
  const file = form?.get("file");
  if (!parsed.success || !(file instanceof File)) return NextResponse.json({ error: "Unvollständige Anfrage." }, { status: 400 });

  try {
    const url = await storeImage({ id: user.id, role: user.role }, parsed.data.kind, parsed.data.refId, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
