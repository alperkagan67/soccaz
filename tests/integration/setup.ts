import { existsSync } from "node:fs";
import { vi } from "vitest";
import { dbUrlAllowed } from "./db-guard";

// Integrationstests laufen gegen eine echte Datenbank, nie gegen eine entfernte.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.PAYMENTS_FAKE = "1"; // der FakeProvider ist nur mit ausdrücklicher Freigabe erlaubt
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt für die Integrationstests.");
if (!dbUrlAllowed(url)) throw new Error("Integrationstests nur gegen lokale Datenbank (Host nicht erlaubt, oder die URL hat Query/Fragment).");

// `connection()` gibt es nur innerhalb einer Next-Anfrage; außerhalb (Tests, Jobs) ist es ein No-op.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
