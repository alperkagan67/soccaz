// Prüft, dass der Zeitplaner startet, Jobs annimmt und ausführt. Aufruf: npx tsx --env-file=.env.local scripts/scheduler-smoke.ts
import { startScheduler } from "../src/server/scheduler";
import { Client } from "pg";

const boss = await startScheduler();
await boss.send("send-reminders", {});
await boss.send("expire-requests", {});
await new Promise((r) => setTimeout(r, 4000));

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query("select name, state, count(*)::int n from pgboss.job where name in ('send-reminders','expire-requests') group by 1,2 order by 1,2");
const { rows: sched } = await db.query("select name, cron from pgboss.schedule order by name");
console.log("Jobs:", JSON.stringify(rows));
console.log("Zeitplan:", sched.map((s) => `${s.name} ${s.cron}`).join(" | "));
await db.end();
await boss.stop({ graceful: true, timeout: 5000 });
const ok = rows.some((r) => r.state === "completed");
console.log(ok ? "OK: Zeitplaner funktioniert" : "FEHLER: kein Job abgeschlossen");
process.exit(ok ? 0 : 1);
