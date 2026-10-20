import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Socaz – Hallenfußball",
    short_name: "Socaz",
    description: "Finde Gegner für Hallenfußball in NRW: Team gründen, Spieler einladen, Spiel ausmachen, Anstoß.",
    lang: "de",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030806",
    theme_color: "#030806",
    categories: ["sports", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Lobby aufmachen", url: "/matchmaking" },
      { name: "Livescore", url: "/spiele" },
      { name: "Meine Spiele", url: "/app" },
    ],
  };
}
