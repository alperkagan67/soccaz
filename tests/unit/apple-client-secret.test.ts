import { execFile } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildClientSecret, MAX_GUELTIGKEIT_SEKUNDEN } from "../../scripts/apple-client-secret.mjs";

// Wegwerf-Schlüssel (nur für diesen Test erzeugt, nie ein echter Apple-Schlüssel)
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ok = { teamId: "ABCDE12345", keyId: "KEYID12345", clientId: "de.socaz.web.anmeldung", privateKeyPem: pem, now: 1_800_000_000 };
const teile = (jwt: string) => jwt.split(".");
const lesen = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

const dir = mkdtempSync(join(tmpdir(), "apple-secret-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const skript = (args: string[], env: Record<string, string>) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) =>
    execFile(process.execPath, ["scripts/apple-client-secret.mjs", ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv }, (err: Error | null, stdout: string, stderr: string) =>
      resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr })));

describe("buildClientSecret", () => {
  it("drei Teile, Kopf ES256 mit kid, Nutzlast iss/sub/aud/iat/exp, Signatur gültig (P-256, ieee-p1363)", () => {
    const { jwt, exp } = buildClientSecret(ok);
    const [k, n, sig] = teile(jwt);
    expect(teile(jwt)).toHaveLength(3);
    expect(lesen(k)).toEqual({ alg: "ES256", kid: "KEYID12345", typ: "JWT" });
    expect(lesen(n)).toEqual({ iss: "ABCDE12345", iat: 1_800_000_000, exp, aud: "https://appleid.apple.com", sub: "de.socaz.web.anmeldung" });
    expect(verify("sha256", Buffer.from(`${k}.${n}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    expect(verify("sha256", Buffer.from(`${k}.${n}x`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(false);
  });
  it("Gültigkeit: Standard 180 Tage, höchstens 6 Monate (15777000 s); darüber, 0 oder nicht ganzzahlig: Fehler", () => {
    const { exp } = buildClientSecret(ok);
    expect(exp - ok.now).toBe(180 * 24 * 3600);
    expect(exp - ok.now).toBeLessThanOrEqual(MAX_GUELTIGKEIT_SEKUNDEN);
    expect(buildClientSecret({ ...ok, gueltigkeit: MAX_GUELTIGKEIT_SEKUNDEN }).exp - ok.now).toBe(MAX_GUELTIGKEIT_SEKUNDEN);
    for (const g of [MAX_GUELTIGKEIT_SEKUNDEN + 1, 0, -5, 1.5]) expect(() => buildClientSecret({ ...ok, gueltigkeit: g }), String(g)).toThrow(/Gültigkeit/);
  });
  it("Pflichtwerte und Schlüsselart: klare Fehler ohne Schlüsselinhalt", () => {
    expect(() => buildClientSecret({ ...ok, teamId: "kurz" })).toThrow(/APPLE_TEAM_ID/);
    expect(() => buildClientSecret({ ...ok, keyId: undefined as unknown as string })).toThrow(/APPLE_KEY_ID/);
    expect(() => buildClientSecret({ ...ok, clientId: "" })).toThrow(/AUTH_APPLE_ID/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => buildClientSecret({ ...ok, privateKeyPem: rsa })).toThrow(/P-256/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => buildClientSecret({ ...ok, privateKeyPem: p384 })).toThrow(/P-256/);
    let meldung = "";
    try { buildClientSecret({ ...ok, privateKeyPem: "-----BEGIN PRIVATE KEY-----\nGEHEIMGEHEIM\n-----END PRIVATE KEY-----" }); } catch (e) { meldung = (e as Error).message; }
    expect(meldung).toMatch(/kein gültiger privater Schlüssel/);
    expect(meldung).not.toContain("GEHEIM");
  });
});

describe("Skript (eigener Prozess)", () => {
  const datei = join(dir, "AuthKey_TEST.p8");
  writeFileSync(datei, pem);
  const env = { APPLE_TEAM_ID: "ABCDE12345", APPLE_KEY_ID: "KEYID12345", AUTH_APPLE_ID: "de.socaz.web.anmeldung" };
  it("stdout enthält NUR das JWT, der Schlüssel erscheint nirgends in der Ausgabe", async () => {
    const r = await skript([datei], env);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split(".")).toHaveLength(3);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    const kern = pem.replace(/-----[^-]+-----|\s/g, "");
    expect(r.stdout + r.stderr).not.toContain(kern.slice(20, 60));
    expect(r.stdout + r.stderr).not.toContain("PRIVATE KEY");
    expect(r.stderr).toMatch(/Gültig bis \d{4}-\d{2}-\d{2}/);
  });
  it("ohne Pfad: Exit 2; unlesbare Datei, fehlende Kennung oder kaputter Schlüssel: Exit 1 ohne Schlüsselinhalt", async () => {
    expect((await skript([], env)).code).toBe(2);
    expect((await skript([join(dir, "gibt-es-nicht.p8")], env)).code).toBe(1);
    expect((await skript([datei], { ...env, APPLE_KEY_ID: "" })).code).toBe(1);
    const kaputt = join(dir, "kaputt.p8");
    writeFileSync(kaputt, "-----BEGIN PRIVATE KEY-----\nGEHEIMGEHEIM\n-----END PRIVATE KEY-----\n");
    const r = await skript([kaputt], env);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).not.toContain("GEHEIM");
  });
});
