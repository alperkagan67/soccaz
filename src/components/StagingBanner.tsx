import { connection } from "next/server";
import { isStaging, STAGING_BANNER_TEXT } from "@/lib/staging";

/**
 * Kleiner Streifen ganz oben, nur auf Staging (APP_ENV=staging). Liest die Umgebung zur Anfragezeit (connection), nicht beim Bauen. Farben nur aus den Tokens (Text --ink auf --panel-2; Kontrast ≥ 4,5:1 hell und dunkel belegt
 * tests/unit/staging-verhalten.test.ts aus den Token-Werten; der Seiten-Kontrastlauf AC-27 läuft ohne APP_ENV=staging und sieht das Banner nicht), Schrift 14 px (--fs-sm), Symbol und Wort zusammen.
 */
export async function StagingBanner() {
  await connection();
  if (!isStaging()) return null;
  return (
    <div role="note" data-testid="staging-banner" className="border-b border-line bg-panel2 px-4 py-1 text-center text-sm font-semibold text-ink">
      <span aria-hidden="true">⚠ </span>
      {STAGING_BANNER_TEXT}
    </div>
  );
}
