import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { teams, users } from "@/db/schema";

type Exec = Pick<typeof db, "select">;

export async function userName(exec: Exec, id: string): Promise<string> {
  const [row] = await exec.select({ name: users.name }).from(users).where(eq(users.id, id));
  return row?.name ?? "Jemand";
}

export async function teamName(exec: Exec, id: string): Promise<string> {
  const [row] = await exec.select({ name: teams.name }).from(teams).where(eq(teams.id, id));
  return row?.name ?? "Team";
}
