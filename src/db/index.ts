import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachPoolErrorHandler } from "./pool-error";
import * as schema from "./schema";
import * as finance from "./schema-finance";
import * as community from "./schema-community";
import * as content from "./schema-content";
import * as league from "./schema-league";
import * as matchmaking from "./schema-matchmaking";

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = attachPoolErrorHandler(
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL }),
  "main",
);
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema: { ...schema, ...finance, ...community, ...content, ...league, ...matchmaking } });
