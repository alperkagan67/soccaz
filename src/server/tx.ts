import type { db } from "@/db";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
