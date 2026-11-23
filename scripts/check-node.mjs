// Früher Versionscheck (npm-Hooks pre<script> in package.json): bricht VOR dem eigentlichen Befehl ab, wenn die Node-Version nicht passt, mit einer verständlichen Meldung
// statt eines späteren "require() of ES Module"-Fehlers. Nur Node-APIs, keine Pakete. Bewusst KEIN preinstall: im Docker-Build liegt vor "npm ci" nur package.json.
import { nodeVersionMessage } from "./lib/node-version.mjs";

const message = nodeVersionMessage(process.versions.node);
if (message) {
  console.error(message);
  process.exit(1);
}
