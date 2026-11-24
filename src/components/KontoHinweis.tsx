import { appleLoginEnabled } from "@/lib/apple-login";
import { APPLE_KONTO_URL, GOOGLE_KONTO_URL } from "@/lib/konto-links";
import { getT } from "@/server/locale";

/**
 * Hinweis für Besucher ohne Konto: "Zum Mitmachen brauchst du ein Google- oder Apple-Konto (kostenlos)." mit Links zum Erstellen und dem Satz, dass jeder Spieler ein EIGENES Konto braucht.
 * Der Text hängt am Schalter der Apple-Anmeldung (appleLoginEnabled, eine Quelle wie /anmelden): aus = nur Google-Konto und ein Link. Texte zentral in src/lib/i18n.ts.
 */
export async function KontoHinweis({ className = "" }: { className?: string }) {
  const { t } = await getT();
  const apple = appleLoginEnabled(process.env);
  const link = "inline-flex min-h-11 items-center underline text-accent-fg";
  return (
    <div className={`space-y-1 text-sm text-muted ${className}`} data-testid="konto-hinweis">
      <p>
        {t(apple ? "konto.hintApple" : "konto.hint")} {t("konto.eigenes")}
      </p>
      <p className="flex flex-wrap gap-x-4">
        <a href={GOOGLE_KONTO_URL} target="_blank" rel="noopener noreferrer" className={link}>
          {t("konto.googleLink")}
        </a>
        {apple && (
          <a href={APPLE_KONTO_URL} target="_blank" rel="noopener noreferrer" className={link}>
            {t("konto.appleLink")}
          </a>
        )}
      </p>
    </div>
  );
}

/** Der Satz allein (für Texte zum Teilen, z. B. WhatsApp): gleiche Quelle und gleicher Schalter. */
export async function kontoSatz(): Promise<string> {
  const { t } = await getT();
  return t(appleLoginEnabled(process.env) ? "konto.hintApple" : "konto.hint");
}
