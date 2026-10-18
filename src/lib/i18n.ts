// Mehrsprachigkeit: Deutsch ist die Hauptsprache, Englisch deckt die zentralen Seiten ab (Navigation, Start, Anmeldung, Fußzeile).
// Die Sprache wird ausdrücklich gewählt (Cookie, bei Angemeldeten auch im Profil). Der Browser-Header entscheidet nie, damit die deutsche Oberfläche stabil bleibt.

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "socaz_locale";
export const LOCALE_NAMES: Record<Locale, string> = { de: "Deutsch", en: "English" };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

const de = {
  "nav.requests": "Spielsuchen",
  "nav.live": "Livescore",
  "nav.ranking": "Rangliste",
  "nav.start": "Start",
  "nav.search": "Suchen",
  "nav.liveShort": "Live",
  "nav.mine": "Meine",
  "nav.signIn": "Anmelden",
  "nav.signOut": "Abmelden",
  "nav.notifications": "Benachrichtigungen",
  "nav.notificationsUnread": "Benachrichtigungen, {count} ungelesen",
  "nav.admin": "Admin",
  "nav.main": "Hauptnavigation",
  "footer.legal": "Rechtliches",
  "footer.imprint": "Impressum",
  "footer.privacy": "Datenschutz",
  "footer.terms": "AGB",
  "footer.rules": "Hausordnung",
  "footer.leagues": "Ligen",
  "footer.matchmaking": "Matchmaking",
  "footer.tournaments": "Turniere",
  "footer.proDay": "Profi-Tag",
  "footer.players": "Spieler",
  "footer.venues": "Hallen",
  "footer.freePlayers": "Mitspieler gesucht",
  "footer.language": "Sprache",
  "home.title1": "Hallenfußball.",
  "home.title2": "Gegner finden. Spielen.",
  "home.lead": "Gründe dein Team, lade deine Jungs per Link ein und fordere andere Teams in NRW heraus.",
  "home.start": "Jetzt starten",
  "home.createTeam": "Team gründen",
  "home.viewRequests": "Spielsuchen ansehen",
  "home.matchmaking": "Gegner finden (Matchmaking)",
  "home.livescore": "Livescore",
  "home.openRequests": "Offene Spielsuchen",
  "home.noRequests": "Noch keine offenen Spielsuchen. Sei die Erste, die einen Gegner sucht.",
  "home.partners": "Partner",
  "signin.title": "Anmelden",
  "signin.lead": "Mit deinem Google-Konto. Kein Passwort nötig.",
  "signin.google": "Mit Google anmelden",
  "signin.banned": "Dein Konto ist gesperrt. Wenn du das für einen Fehler hältst, schreib uns über die Kontaktseite.",
  "signin.unavailable": "Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal.",
} as const;

export type MessageKey = keyof typeof de;

const en: Record<MessageKey, string> = {
  "nav.requests": "Match requests",
  "nav.live": "Live scores",
  "nav.ranking": "Rankings",
  "nav.start": "Home",
  "nav.search": "Search",
  "nav.liveShort": "Live",
  "nav.mine": "Mine",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.notifications": "Notifications",
  "nav.notificationsUnread": "Notifications, {count} unread",
  "nav.admin": "Admin",
  "nav.main": "Main navigation",
  "footer.legal": "Legal",
  "footer.imprint": "Imprint",
  "footer.privacy": "Privacy",
  "footer.terms": "Terms",
  "footer.rules": "House rules",
  "footer.leagues": "Leagues",
  "footer.matchmaking": "Matchmaking",
  "footer.tournaments": "Tournaments",
  "footer.proDay": "Pro day",
  "footer.players": "Players",
  "footer.venues": "Venues",
  "footer.freePlayers": "Players wanted",
  "footer.language": "Language",
  "home.title1": "Indoor football.",
  "home.title2": "Find opponents. Play.",
  "home.lead": "Create your team, invite your mates with a link and challenge other teams in North Rhine-Westphalia.",
  "home.start": "Get started",
  "home.createTeam": "Create a team",
  "home.viewRequests": "Browse match requests",
  "home.matchmaking": "Find an opponent (matchmaking)",
  "home.livescore": "Live scores",
  "home.openRequests": "Open match requests",
  "home.noRequests": "No open match requests yet. Be the first to look for an opponent.",
  "home.partners": "Partners",
  "signin.title": "Sign in",
  "signin.lead": "With your Google account. No password needed.",
  "signin.google": "Sign in with Google",
  "signin.banned": "Your account is suspended. If you think this is a mistake, contact us.",
  "signin.unavailable": "Sign-in is currently unavailable. Please try again later.",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { de, en };

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = MESSAGES[locale]?.[key] ?? de[key];
  return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : template;
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;
export const translator = (locale: Locale): Translator => (key, vars) => translate(locale, key, vars);
