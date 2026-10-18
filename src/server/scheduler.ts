import PgBoss from "pg-boss";
import { JOBS, runJob, SCHEDULE } from "./jobs";

const globalForBoss = globalThis as unknown as { __boss?: Promise<PgBoss> };

/** Startet den Zeitplaner (pg-boss, eigenes Schema "pgboss" in derselben Datenbank). Pro Prozess nur einmal. */
export function startScheduler(): Promise<PgBoss> {
  globalForBoss.__boss ??= (async () => {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
    boss.on("error", (error) => console.error("[scheduler]", error));
    await boss.start();
    for (const name of Object.keys(JOBS)) {
      await boss.createQueue(name);
      await boss.work(name, async () => {
        const result = await runJob(name);
        if (result) console.log(`[scheduler] ${name}:`, JSON.stringify(result));
      });
      const cron = SCHEDULE[name];
      if (cron) await boss.schedule(name, cron);
    }
    console.log("[scheduler] gestartet:", Object.keys(SCHEDULE).join(", "));
    return boss;
  })();
  return globalForBoss.__boss;
}
