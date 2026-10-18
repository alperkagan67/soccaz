import { existsSync } from "node:fs";
import { vi } from "vitest";

// Integrationstests laufen gegen eine echte Datenbank, nie gegen eine entfernte.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt für die Integrationstests.");
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Integrationstests nur gegen lokale Datenbank (Host war ${host}).`);

// `connection()` gibt es nur innerhalb einer Next-Anfrage; außerhalb (Tests, Jobs) ist es ein No-op.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
