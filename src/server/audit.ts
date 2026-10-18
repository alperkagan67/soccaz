import { db } from "@/db";
import { auditLog } from "@/db/schema";

type Executor = Pick<typeof db, "insert">;

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  data: { before?: unknown; after?: unknown } = {},
  executor: Executor = db,
) {
  await executor.insert(auditLog).values({
    actorId,
    action,
    entity,
    entityId,
    before: data.before ?? null,
    after: data.after ?? null,
  });
}
