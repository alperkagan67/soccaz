# Socaz als App (Android und iPhone)

Die Web-App ist schon eine installierbare PWA (Startbildschirm, Offline-Seite, Push). Für den App Store und Google Play verpacken wir dieselbe Seite mit [Capacitor](https://capacitorjs.com/): Die App ist ein Rahmen, der die echte Seite von `server.url` lädt. Es gibt also nur einen Code und eine Veröffentlichung für Web und App.

**Stand:** Die Konfiguration liegt bereit (`capacitor.config.json`). Gebaut oder eingereicht ist noch nichts, denn dafür braucht es Konten und Geräte, die nur der Betreiber hat.

## Voraussetzungen

| Für | Du brauchst |
| --- | --- |
| Android | Android Studio, Google-Play-Konto (einmalig 25 US-Dollar) |
| iPhone | Mac mit Xcode, Apple-Developer-Konto (99 US-Dollar im Jahr) |
| beides | die Seite muss unter einer festen https-Adresse laufen (`server.url`) |

## Einrichten

```bash
cd mobile
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/splash-screen @capacitor/push-notifications
# server.url in capacitor.config.json auf die echte Adresse setzen
npx cap add android
npx cap add ios
npx cap sync
npx cap open android   # oder: npx cap open ios
```

Icons und Startbild erzeugen: `npx @capacitor/assets generate` mit einem Bild `assets/icon.png` (1024 x 1024) aus `public/icons`.

## Wichtig für die Freigabe in den Stores

- **Apple prüft streng**: Eine App, die nur eine Webseite zeigt, wird oft abgelehnt (Richtlinie 4.2). Wir brauchen echten App-Nutzen: Push-Mitteilungen, Teilen, Kamera für Spielfotos. Diese Plugins sind in der Liste oben schon enthalten.
- **Zahlungen**: Guthaben-Aufladen ist der Kauf von Dienstleistungen außerhalb der App (Hallenmiete). Das ist erlaubt, muss aber im Review erklärt werden. Digitale Güter wie Abzeichen dürfen nie gegen Geld verkauft werden.
- **Datenschutz**: In beiden Stores brauchst du die Adresse der Datenschutzerklärung (`/datenschutz`) und die Angabe, dass Konten gelöscht werden können (`/app/einstellungen`). Beides ist vorhanden.
- **Push**: Auf Android läuft Web-Push im Rahmen. Auf dem iPhone braucht es APNs-Schlüssel und das Plugin `@capacitor/push-notifications` samt kleiner Server-Anbindung. Das ist noch nicht gebaut.

## Entwickeln gegen den lokalen Rechner

Für Tests auf dem Handy `server.url` auf `http://<IP-des-Rechners>:3100` setzen und `cleartext` auf `true` stellen. Vor dem Release wieder zurücksetzen.
