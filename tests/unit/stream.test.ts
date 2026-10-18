import { describe, expect, it } from "vitest";
import { parseStreamUrl } from "@/lib/stream";

const HOST = "socaz.de";

describe("Stream-Adressen", () => {
  it("Twitch: Kanal wird zum Player mit parent", () => {
    expect(parseStreamUrl("https://www.twitch.tv/MeinKanal", HOST)).toEqual({
      provider: "twitch",
      source: "meinkanal",
      embedUrl: "https://player.twitch.tv/?channel=meinkanal&parent=socaz.de&muted=true",
    });
    expect(parseStreamUrl("https://twitch.tv/kanal_1/", HOST)?.provider).toBe("twitch");
    expect(parseStreamUrl("https://m.twitch.tv/kanal", HOST)?.provider).toBe("twitch");
  });
  it("Twitch: Unterseiten und seltsame Namen werden abgelehnt", () => {
    expect(parseStreamUrl("https://twitch.tv/kanal/videos/123", HOST)).toBeNull();
    expect(parseStreamUrl("https://twitch.tv/", HOST)).toBeNull();
    expect(parseStreamUrl("https://twitch.tv/a", HOST)).toBeNull();
    expect(parseStreamUrl("https://twitch.tv/ka nal", HOST)).toBeNull();
    expect(parseStreamUrl("https://twitch.tv/kanal&parent=evil.com", HOST)).toBeNull();
  });
  it("YouTube: watch, youtu.be, live und embed", () => {
    const id = "dQw4w9WgXcQ";
    const expected = { provider: "youtube", source: id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
    expect(parseStreamUrl(`https://www.youtube.com/watch?v=${id}`, HOST)).toEqual(expected);
    expect(parseStreamUrl(`https://youtu.be/${id}`, HOST)).toEqual(expected);
    expect(parseStreamUrl(`https://youtube.com/live/${id}?feature=share`, HOST)).toEqual(expected);
    expect(parseStreamUrl(`https://www.youtube.com/embed/${id}`, HOST)).toEqual(expected);
  });
  it("YouTube: ungültige IDs und fremde Pfade", () => {
    expect(parseStreamUrl("https://www.youtube.com/watch?v=zu_kurz", HOST)).toBeNull();
    expect(parseStreamUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ%22%3E%3Cscript", HOST)).toBeNull();
    expect(parseStreamUrl("https://www.youtube.com/@kanal", HOST)).toBeNull();
    expect(parseStreamUrl("https://www.youtube.com/watch", HOST)).toBeNull();
  });
  it("Kick", () => {
    expect(parseStreamUrl("https://kick.com/Meine_Show", HOST)).toEqual({ provider: "kick", source: "meine_show", embedUrl: "https://player.kick.com/meine_show" });
    expect(parseStreamUrl("https://kick.com/a/b", HOST)).toBeNull();
  });
  it("alles andere wird abgelehnt: fremde Hosts, http, Zugangsdaten, Skripte, Müll", () => {
    for (const bad of [
      "https://evil.com/twitch.tv/kanal",
      "https://twitch.tv.evil.com/kanal",
      "https://eviltwitch.tv/kanal",
      "http://twitch.tv/kanal",
      "https://user:pw@twitch.tv/kanal",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "",
      "kein link",
    ]) {
      expect(parseStreamUrl(bad, HOST), bad).toBeNull();
    }
  });
  it("parent wird kodiert", () => {
    expect(parseStreamUrl("https://twitch.tv/kanal", "a&b.de")?.embedUrl).toContain("parent=a%26b.de");
  });
});
