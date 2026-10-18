import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { InstallHint } from "@/components/InstallHint";
import { PwaRegister } from "@/components/PwaRegister";
import { getCurrentUser } from "@/server/session";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Socaz – Hallenfußball. Gegner finden. Spielen.", template: "%s · Socaz" },
  description:
    "Finde Gegner für Hallenfußball in NRW: Team gründen, Spieler einladen, Spiel ausmachen, Anstoß.",
  applicationName: "Socaz",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Socaz", statusBarStyle: "black-translucent" },
};

// Alle Seiten lesen die Sitzung zur Anfragezeit; Instant-Navigation-Validierung bewusst aus.
export const instant = false;

export const viewport: Viewport = {
  themeColor: "#030806",
  width: "device-width",
  initialScale: 1,
};

async function MobileNav() {
  const user = await getCurrentUser();
  return <BottomNav signedIn={Boolean(user)} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <Suspense fallback={<div className="h-14" />}>
          <Header />
        </Suspense>
        <Suspense fallback={<p className="mx-auto max-w-3xl p-6 text-muted">Lädt…</p>}>
          <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-6 pt-4 sm:px-6">
            <InstallHint />
            {children}
          </main>
        </Suspense>
        <Footer />
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
        <PwaRegister />
      </body>
    </html>
  );
}
