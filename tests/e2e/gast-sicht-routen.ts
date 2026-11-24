// AC-17 Gast-Sicht-Gesamtprüfung (Entscheid t2q 2026-11-24): JEDE Route aus src/app steht hier mit einem Status. Eine neue Route ohne Eintrag (oder ein Eintrag ohne Route) macht tests/unit/gast-sicht-routen.test.ts rot.
// Schlüssel = Pfad relativ zu src/app (Seiten ohne "/page", Routen ohne "/route", Bild-Routen mit Dateiname); Doku: docs/design/gast-sicht-gesamtpruefung.md.
//
//   geprueft    Gast-Probe in tests/e2e/gast-sicht-gesamt.spec.ts mit Seed "Zorro Vollname": kein Klarname, keine Kennung; Vakuum-Schutz: die Seite ist belegt (marker), bei Initialen steht ">ZV<" drin.
//   statisch    keine Personendaten (Begründung); die Probe prüft trotzdem, dass die Seite antwortet und keinen Seed-Namen enthält.
//   angemeldet  nur für Angemeldete/Admins: der Gast bekommt Weiterleitung, 401, 403 oder 404 und nie Daten.
//   intern      kein Gast-Zugriff vorgesehen (Webhook, Job, Entwicklerseite): Begründung.
//   ausnahme    zeigt bewusst Klarnamen oder Daten (Entscheid, Verweis): nie stillschweigend.
export type Probe = "html" | "html+rsc" | "json" | "sse" | "bild" | "text";
export type Eintrag =
  | { art: "geprueft"; probe: Probe; marker: string; initialen?: boolean; beleg: string }
  | { art: "statisch"; grund: string }
  | { art: "angemeldet"; grund: string }
  | { art: "intern"; grund: string }
  | { art: "ausnahme"; grund: string };

const g = (probe: Probe, marker: string, beleg: string, initialen = false): Eintrag => ({ art: "geprueft", probe, marker, initialen, beleg });
const s = (grund: string): Eintrag => ({ art: "statisch", grund });
const a = (grund: string): Eintrag => ({ art: "angemeldet", grund });
const i = (grund: string): Eintrag => ({ art: "intern", grund });

const ADMIN = "Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet";
const APP = "Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet";

export const ROUTEN: Record<string, Eintrag> = {
  // --- Seiten mit Personenbezug (Gast-Probe mit Seed) ---
  "/": g("html+rsc", "Hallenfußball", "Startseite und Lobby-Board: Spieler nur als Initialen (guest-board.ts)", true),
  "/spiele": g("html", "Livescore", "Spieleliste: nur Team-Namen und Ergebnisse"),
  "/spiele/[id]": g("html+rsc", "Spielverlauf", "Spielbericht: Torschütze und Spieler des Spiels als Initialen (PR C)", true),
  "/spiele/[id]/opengraph-image": g("bild", "image/png", "og:image des Spiels = matchCard: Torschützen nur Initialen (R-T382)"),
  "/rangliste": g("html+rsc", "Torjäger", "Torjäger und Beste Spieler: Initialen ohne Link (PR B)", true),
  "/spieler": g("html+rsc", "Spieler", "Spielerliste: Initialen ohne Link, keine Namenssuche (PR B)", true),
  "/spieler/[id]": g("html", "anmelden", "Profil: Gast wird zur Anmeldung geleitet, kein Name im Text (PR D)"),
  "/teams": s("Teamliste: nur Teamname, Stadt und Spielerzahl (Teamnamen sind keine Personennamen)"),
  "/teams/[slug]": g("html+rsc", "Kommentare", "Team: Kommentare (Initialen), Torjäger namenfrei, Karten neutral (PR A, cardViewerFor)", true),
  "/teams/[slug]/opengraph-image": g("bild", "image/png", "og:image des Teams: nur Teamname und Stadt"),
  "/turniere": g("html", "Turniere", "Turnierliste: Turnier- und Teamnamen, kein Veranstalter-Klarname"),
  "/turniere/[id]": g("html+rsc", "Captain:", "Turnier: Veranstalter als Vorname + Initial (t2q), Captain und Spieler als Initialen (PR B)"),
  "/lobby/[id]": g("html+rsc", "game-number", "Lobby: Teilnehmer und Rest-Kader als Initialen (5a, #302)", true),
  "/lobby/offen/[entryId]": g("html+rsc", "open-lobby-team", "Offene Lobby: Namen nur für Teammitglieder, Gäste nur Anzahl (PR B)"),
  "/einladung/[token]": g("html", "Du wurdest eingeladen", "Team-Einladung: Teamname, Stadt, Spielerzahl, keine Namen"),
  "/spiel/[token]": g("html+rsc", "game-organizer", "Privatspiel-Einladung: Veranstalter als Vorname + Initial (PR B, t2q)"),
  "/mitspieler": g("html+rsc", "Mitspieler gesucht", "Mitspieler gesucht: Initialen ohne Link, keine Position (PR B)", true),
  "/suche": g("html+rsc", "Offene Lobbys", "Spielsuche: Lobby-Board mit Initialen", true),
  "/matchmaking": g("html+rsc", "Lobby aufmachen", "Lobby aufmachen: offene Suchen und Warteschlange, Namen nur Mitglieder"),
  "/suche/[id]": g("html+rsc", "Spielsuche", "Spielsuche-Detail: Kader als Initialen (GuestRoster)", true),
  "/overlay/[id]": g("html", "overlay", "Overlay: nur Teamnamen und Spielstand"),
  "/hallen": s("Hallenliste: Hallenname, Stadt, Bewertung (keine Personen)"),
  "/hallen/[id]": g("html+rsc", "Bewertungen", "Halle: Bewertungen mit Autor als Initialen (PR A, Comments)", true),
  // --- API-Kanäle ---
  "/api/spiele/[id]/live": g("json", "goals", "öffentliches Spielstand-JSON: Torschützen immer Initialen (PR C)"),
  "/api/spiele/[id]/events": g("sse", "verbunden", "SSE Spiel: nur event: update, keine Nutzdaten"),
  "/api/spiele/stream": g("sse", "verbunden", "SSE Livescore: nur update"),
  "/api/lobby/[id]/events": g("sse", "verbunden", "SSE Lobby: nur update"),
  "/api/karte/[id]": g("bild", "image/png", "Spielbericht-Karte als Bild: Torschützen nur Initialen (R-T382)"),
  "/robots": g("text", "Disallow: /spieler/", "robots.txt sperrt /spieler/ (PR D)"),
  "/sitemap": g("text", "<urlset", "Sitemap: Teams, Hallen, feste Seiten, keine Spielerprofile"),
  // --- Statisch / ohne Personendaten ---
  "/anmelden": s("Anmeldeformular"),
  "/agb": s("Rechtstext"),
  "/datenschutz": s("Rechtstext"),
  "/hausordnung": s("Rechtstext"),
  "/hilfe": s("Hilfetext"),
  "/impressum": s("Rechtstext (Betreiberangaben stehen im Impressum bewusst)"),
  "/kontakt": s("Kontaktseite"),
  "/offline": s("PWA-Offline-Seite"),
  "/unter-16": s("Endseite nach Konto-Löschung, keine Daten"),
  "/ligen": s("zurückgestellt und ausgeblendet (Vertrag 013): Liganamen und Teams"),
  "/ligen/[id]": s("zurückgestellt und ausgeblendet (Vertrag 013): Tabelle mit Teamnamen"),
  "/profitag": s("zurückgestellt und ausgeblendet (Vertrag 013): Termine"),
  "/profitag/[id]": s("zurückgestellt und ausgeblendet (Vertrag 013): bewerbende Teams"),
  "/manifest": s("PWA-Manifest"),
  "/not-found": s("404-Seite"),
  "/api/health": s("Zustandsabfrage ohne Daten"),
  "/api/sponsor/[id]": s("Weiterleitung auf die Sponsor-Adresse, zählt den Klick"),
  "/api/media/[id]": { art: "ausnahme", grund: "liefert Bilder öffentlich per UUID (Profilbilder, Spielfotos; Gesichter, keine Namen): Backlog 243, Produktfrage Sichtbarkeitsmatrix 013" },
  // --- Nur Angemeldete / Admins ---
  "/admin": a(ADMIN),
  "/admin/beweis": a(ADMIN),
  "/admin/buchungen": a(ADMIN),
  "/admin/einstellungen": a(ADMIN),
  "/admin/finanzen": a(ADMIN),
  "/admin/finanzen/ausgaben": a(ADMIN),
  "/admin/finanzen/export": a(ADMIN),
  "/admin/finanzen/rechnungen": a(ADMIN),
  "/admin/finanzen/spiel/[id]": a(ADMIN),
  "/admin/hallen": a(ADMIN),
  "/admin/hallen/anfragen": a(ADMIN),
  "/admin/ligen": a(ADMIN),
  "/admin/moderation": a(ADMIN),
  "/admin/nutzer": a(ADMIN),
  "/admin/profitag": a(ADMIN),
  "/admin/protokoll": a(ADMIN),
  "/admin/spiele": a(ADMIN),
  "/admin/sponsoren": a(ADMIN),
  "/admin/teams": a(ADMIN),
  "/admin/zahlungsstreit": a(ADMIN),
  "/admin/zahlungsstreit/[id]": a(ADMIN),
  "/app": a(APP),
  "/app/benachrichtigungen": a(APP),
  "/app/einstellungen": a(APP),
  "/app/guthaben": a(APP),
  "/app/privatspiel/neu": a(APP),
  "/app/suche/neu": a(APP),
  "/app/teams/neu": a(APP),
  "/app/turniere/neu": a(APP),
  "/halle": a("Hallenbetreiber-Bereich: requireUser"),
  "/halle/anfragen": a("Hallenbetreiber-Bereich: requireUser"),
  "/willkommen": a("Einrichtung nach der Anmeldung: der Gast wird zur Anmeldung geleitet"),
  "/lobby/[id]/uebersicht": a("Spielübersicht nur für Beteiligte: der Gast wird umgeleitet"),
  "/api/belege/[id]": a("Beleg-PDF: getCurrentUser, 401 ohne Anmeldung"),
  "/api/rechnungen/[id]": a("Rechnungs-PDF: getCurrentUser, 401 ohne Anmeldung"),
  "/api/beweis/[matchId]": a("Beweisprotokoll-PDF: Admin 1"),
  "/api/beweis/kette": a("Beweisprotokoll-Export: Admin 1"),
  "/api/mein-konto/export": a("Datenexport des eigenen Kontos: Anmeldung"),
  "/api/media": a("Bild-Upload (POST): Anmeldung"),
  // --- Intern ---
  "/api/auth/[...nextauth]": i("Auth.js: Anmelde- und Sitzungsendpunkte"),
  "/api/jobs/[name]": i("Job-Endpunkt mit Geheimnis (Cron), kein Gast-Zugriff vorgesehen"),
  "/api/stripe/webhook": i("Stripe-Webhook (POST, Signatur)"),
  "/api/webhooks/stripe": i("Stripe-Webhook (POST, Signatur)"),
  "/dev/komponenten": i("Entwickler-Showcase, nur außerhalb von Produktion (404 dort)"),
};
