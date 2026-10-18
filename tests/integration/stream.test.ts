import { afterAll, describe, expect, it } from "vitest";
import { cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";
import { setStreamUrl } from "@/server/streams";

afterAll(cleanup);

describe("Stream-Link", () => {
  it("nur Team-Admins des Spiels und Plattform-Admins, nur erlaubte Anbieter", async () => {
    const m = await makeMatch({ hoursAhead: 48 });
    const outsider = await makeUser("outsider");
    await expect(setStreamUrl(outsider.id, m.match.id, "https://twitch.tv/mein_kanal")).rejects.toThrow(/Team-Admins/);
    await expect(setStreamUrl(m.adminA.id, m.match.id, "https://evil.example/live")).rejects.toThrow(/nicht unterstützt/);
    await expect(setStreamUrl(m.adminA.id, m.match.id, "javascript:alert(1)")).rejects.toThrow(/nicht unterstützt/);
    await setStreamUrl(m.adminA.id, m.match.id, "https://twitch.tv/mein_kanal");
    expect((await reloadMatch(m.match.id)).streamUrl).toBe("https://twitch.tv/mein_kanal");
    // Gast-Admin darf überschreiben, Plattform-Admin ebenfalls, leer entfernt
    await setStreamUrl(m.adminB.id, m.match.id, "https://kick.com/anderer");
    const admin = await makeUser("padmin", "admin");
    await setStreamUrl(admin.id, m.match.id, "https://youtu.be/dQw4w9WgXcQ");
    expect((await reloadMatch(m.match.id)).streamUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    await setStreamUrl(m.adminA.id, m.match.id, "  ");
    expect((await reloadMatch(m.match.id)).streamUrl).toBeNull();
    await expect(setStreamUrl(m.adminA.id, crypto.randomUUID(), "https://twitch.tv/x1")).rejects.toThrow(/nicht gefunden/);
  });
});
