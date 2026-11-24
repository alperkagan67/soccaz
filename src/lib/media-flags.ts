// Spielfotos sind bis zum Social-Media-Teil AUS (Entscheid t2q 2026-11-24, Backlog 243): kein Hochladen, keine Anzeige. Die Daten bleiben, das Wiedereinschalten ist eine Umgebungsvariable.
// Profilbild und Teamlogo bleiben, aber nur für Angemeldete abrufbar (siehe /api/media/[id]).
export const matchPhotosEnabled = (): boolean => process.env.MATCH_PHOTOS_ENABLED === "1";
