import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Socaz – Hallenfußball. Gegner finden. Spielen.", template: "%s · Socaz" },
  description:
    "Finde Gegner für Hallenfußball in NRW: Team gründen, Spieler einladen, Spiel ausmachen, Anstoß.",
};

// Alle Seiten lesen die Sitzung zur Anfragezeit; Instant-Navigation-Validierung bewusst aus.
export const instant = false;

export const viewport: Viewport = {
  themeColor: "#030806",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <Suspense fallback={<div className="h-14" />}>
          <Header />
        </Suspense>
        <Suspense fallback={<p className="mx-auto max-w-3xl p-6 text-muted">Lädt…</p>}>
          <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6">{children}</main>
        </Suspense>
      </body>
    </html>
  );
}
