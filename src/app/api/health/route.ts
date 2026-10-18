import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Gesundheitsprüfung für Docker, Uptime Kuma und den Reverse Proxy. Verrät nichts über Interna. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
