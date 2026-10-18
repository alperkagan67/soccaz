import { timingSafeEqual } from "node:crypto";
import { JOBS, runJob } from "@/server/jobs";

function secretMatches(given: string | null): boolean {
  const expected = process.env.JOB_SECRET ?? (process.env.NODE_ENV !== "production" ? "dev-job-secret" : "");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stößt einen Job manuell an (Wartung und Tests). Geschützt durch JOB_SECRET. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[name]">) {
  if (!secretMatches(request.headers.get("x-job-secret"))) return new Response("Verboten", { status: 403 });
  const { name } = await ctx.params;
  if (!(name in JOBS)) return Response.json({ error: "Unbekannter Job" }, { status: 404 });
  const result = await runJob(name);
  return Response.json({ ok: true, result });
}
