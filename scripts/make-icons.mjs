// Erzeugt die App-Icons aus dem Logo. Aufruf: node scripts/make-icons.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const source = "public/brand/socca-logo.jpeg";
const BG = { r: 3, g: 8, b: 6, alpha: 1 }; // #030806, wie die Seite
mkdirSync("public/icons", { recursive: true });

async function icon(file, size, { padding = 0 } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(source).resize(inner, inner, { fit: "contain", background: BG }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(`public/icons/${file}`);
  console.log("OK", file, `${size}x${size}`);
}

await icon("icon-192.png", 192);
await icon("icon-512.png", 512);
await icon("maskable-512.png", 512, { padding: 0.12 }); // Sicherheitsrand für runde und eckige Masken
await icon("apple-touch-icon.png", 180, { padding: 0.04 });
await icon("favicon-32.png", 32);
