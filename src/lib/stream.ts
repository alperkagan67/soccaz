// Live-Streams einbetten: nur Twitch, YouTube und Kick, nur über feste Einbettungsadressen.
// Aus der Eingabe wird nie etwas ungeprüft in einen iframe übernommen: Wir lesen Kanal oder Video-ID heraus und bauen die Adresse selbst.

export type StreamProvider = "twitch" | "youtube" | "kick";
export type Stream = { provider: StreamProvider; source: string; embedUrl: string };

const CHANNEL = /^[A-Za-z0-9_]{2,40}$/;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;

/** `host` ist der Name dieser Seite, Twitch verlangt ihn als parent. */
export function parseStreamUrl(input: string, host: string): Stream | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (hostname === "twitch.tv") {
    const channel = parts[0];
    if (!channel || parts.length > 1 || !CHANNEL.test(channel)) return null;
    return { provider: "twitch", source: channel.toLowerCase(), embedUrl: `https://player.twitch.tv/?channel=${channel.toLowerCase()}&parent=${encodeURIComponent(host)}&muted=true` };
  }
  if (hostname === "kick.com") {
    const channel = parts[0];
    if (!channel || parts.length > 1 || !CHANNEL.test(channel)) return null;
    return { provider: "kick", source: channel.toLowerCase(), embedUrl: `https://player.kick.com/${channel.toLowerCase()}` };
  }
  if (hostname === "youtube.com" || hostname === "youtube-nocookie.com" || hostname === "youtu.be") {
    let id: string | undefined;
    if (hostname === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (parts[0] === "live" || parts[0] === "embed" || parts[0] === "shorts") id = parts[1];
    if (!id || !VIDEO.test(id)) return null;
    return { provider: "youtube", source: id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }
  return null;
}

export const STREAM_HELP = "Erlaubt sind Links zu Twitch (twitch.tv/kanal), YouTube (Live- oder Video-Link) und Kick (kick.com/kanal).";
