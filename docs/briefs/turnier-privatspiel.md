Du arbeitest an Socaz, einer Plattform zum Organisieren von Hallenfußball.

AUSGANGSLAGE
Team gründen, Team beitreten, Lobby gründen und Lobby beitreten funktionieren
einwandfrei. Dieses System ist die Grundlage und darf sich im Verhalten nicht ändern.
Erweitere es um einen Turniermodus und einen Modus für private Spiele. Baue keine
zweite Team- oder Lobby-Logik, sondern nutze die vorhandene wieder.

ARBEITSWEISE
1. Analysiere zuerst den Code: Datenmodell, Routen, Team- und Lobby-Logik, Einladungen,
   Guthaben, Zahlungen, Ergebnisse und Benachrichtigungen.
2. Liefere danach einen Plan: was wiederverwendet wird, was geändert wird, was neu
   entsteht, nötige Datenbankmigrationen und Risiken. Warte auf meine Freigabe.
3. Setze zuerst das Turnier um, danach das Privatspiel. Teste jeden Modus einzeln.
4. Halte bestehende Abläufe mit Tests abgesichert, damit nichts kaputtgeht.

ANPASSUNG AN DER BESTEHENDEN LOBBY
- "Tag 1", "Tag 2" und "Tag 3" wirken im Lobby-Formular wie ein Turnier. Prüfe, wofür
  diese Felder genutzt werden, und mache klar erkennbar, dass es Zeitfenster sind.
- Ein normales Teamspiel bleibt: Team öffnet Lobby, die Lobby erscheint unter "Offene
  Lobbys und Suchen", ein anderes Team fordert es heraus.
- Prüfe, ob dieser Ablauf vollständig funktioniert. Ergänze nur, was wirklich fehlt.
- Trenne die Oberfläche klar in "Teamspiel", "Privatspiel" und "Turnier".

TURNIERMODUS
Beispiel: Im Ramadan organisieren Moscheen aus verschiedenen Städten gemeinsam ein
Hallenfußballturnier.

Erstellung:
- Ein Organisator legt Name, Teamanzahl, Spielort, Termin, Eintritt pro Spieler und
  Anmeldeschluss fest.
- Das Turnier ist standardmäßig privat und nur über einen Einladungslink erreichbar.

Beitritt:
- Jedes teilnehmende Team hat genau einen Captain, zum Beispiel einen pro Moschee.
- Der Captain tritt mit einem bestehenden Team bei oder gründet über die vorhandene
  Teamfunktion ein neues Team.
- Mitspieler treten über die bestehende Einladungslogik bei.
- Jeder Spieler bezahlt seinen Eintritt selbst über die Plattform.

Turnier-Lobby:
- Vor dem Start gibt es eine gemeinsame Turnier-Lobby. Sie baut auf der bestehenden
  Lobby-Logik auf.
- Sie zeigt alle Teams, Captains, Spieler, den Zahlungsstatus und den Bereit-Status.
- Ein Captain kann erst auf "Bereit" drücken, wenn alle Spieler seines Teams bezahlt
  haben. Prüfe das serverseitig, nicht nur im Frontend.
- Ändert sich der Kader oder fehlt danach eine Zahlung, wird "Bereit" zurückgesetzt.

Bracket:
- Das Bracket bleibt verborgen, bis alle Teams beigetreten sind und alle Captains auf
  "Bereit" gedrückt haben. Auch die API darf es vorher nicht ausliefern.
- Danach wird einmalig ein K.-o.-Bracket als Vorlage erzeugt und angezeigt.
- Ergebnisse führen die Sieger automatisch in die nächste Runde.
- Passt die Teamzahl nicht genau auf 4, 8, 16 oder 32, gibt es Freilose.
- Nutze für Spiele und Ergebnisse die bestehende Logik, soweit sie passt.

Sonderfälle:
- Bis zum Anmeldeschluss kann der Organisator fehlende Teams ersetzen.
- Danach kann er das Turnier absagen. Bezahlte Beiträge werden dann vollständig auf das
  Guthaben der Spieler zurückgebucht.
- Doppelte Zahlungen und doppelte Bracket-Erzeugung müssen ausgeschlossen sein.

PRIVATSPIEL
- Eine Person erstellt ein Spiel für ihre Freundesgruppe, Standard sind 10 Spieler.
- Das Spiel ist nicht öffentlich sichtbar und nur über einen Einladungslink erreichbar.
- Der Link lässt sich per WhatsApp teilen. Eingeladene melden sich an oder registrieren
  sich und landen danach direkt in diesem Spiel.
- Die Lobby zeigt Teilnehmer, freie Plätze und Zahlungsstatus.
- Der Organisator teilt die Spieler in zwei Teams ein oder lässt sie zufällig einteilen.
- Die Hallenmiete wird auf die zahlenden Spieler aufgeteilt.
- Das Spiel zählt nicht für die öffentliche Rangliste.

ABNAHME
- Team gründen, Team beitreten, Lobby gründen und Lobby beitreten funktionieren unverändert.
- Ein Captain kann ohne vollständige Zahlung seines Teams nicht auf "Bereit" drücken.
- Das Bracket ist vorher weder in der Oberfläche noch über die API sichtbar.
- Sobald alle Bedingungen erfüllt sind, erscheint genau ein korrektes Bracket.
- Sieger rücken nach dem Eintragen des Ergebnisses automatisch weiter.
- Ein Privatspiel-Link funktioniert auch für neu registrierte Nutzer.
- Ein Privatspiel erscheint nicht öffentlich und nicht in der Rangliste.
- Schreibe automatisierte Tests für Rechte, Zahlungen, Bereit-Logik und Bracket.
