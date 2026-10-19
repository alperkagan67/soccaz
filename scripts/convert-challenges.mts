// Wandelt alte Herausforderungen (Spielsuchen mit Zielteam) in Lobbys um. Aufruf: npx tsx --env-file=.env.local scripts/convert-challenges.mts
import { convertLegacyChallenges } from "../src/server/challenges";

console.log(`${await convertLegacyChallenges()} Herausforderung(en) umgewandelt.`);
process.exit(0);
