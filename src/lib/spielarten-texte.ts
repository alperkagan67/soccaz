// 013 M3: EIN Wortlaut für die drei Spielarten (Teamspiel, Privatspiel, Turnier). Quelle für /suche (Auswahlschritt) und für GameModes auf Start und /app: ein Baustein, eine Quelle (Review w4 R-T367 c).
// Die Sätze für Teamspiel und Privatspiel sind der bisherige Wortlaut aus GameModes.
export const SPIELART_TEXT = {
  team: { title: "Teamspiel", text: "Dein Team gegen ein anderes Team. Der Captain öffnet eine Lobby, die für alle sichtbar ist, ein anderes Team tritt an." },
  private: { title: "Privatspiel", text: "Für deine Freundesgruppe: nicht öffentlich, nur per Einladungslink, ohne Rangliste. Du teilst die Spieler in zwei Teams ein." },
  tournament: { title: "Turnier", text: "Mehrere Teams, ein Sieger. Der Captain meldet das Team an." },
} as const;
