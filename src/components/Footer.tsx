import Link from "next/link";
import { getT } from "@/server/locale";
import { getCurrentUser } from "@/server/session";
import { gesperrtFuerNutzer, pfadGesperrt } from "@/lib/turnier-only";
import { LanguageSwitch } from "./LanguageSwitch";

export async function Footer() {
  const { locale, t } = await getT();
  const nurTurnier = gesperrtFuerNutzer(await getCurrentUser()); // TURNIER_ONLY: Links in gesperrte Bereiche entfallen
  const show = (href: string) => !nurTurnier || !pfadGesperrt(href);
  return (
    <footer className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-24 text-sm text-muted sm:px-6 sm:pb-8">
      <nav aria-label={t("footer.legal")} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4">
        {show("/hilfe") && <Link href="/hilfe" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.help")}</Link>}
        {show("/kontakt") && <Link href="/kontakt" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.contact")}</Link>}
        {show("/spiele") && <Link href="/spiele" className="inline-flex min-h-11 items-center hover:text-ink">{t("nav.live")}</Link>}
        {show("/rangliste") && <Link href="/rangliste" className="inline-flex min-h-11 items-center hover:text-ink">{t("nav.ranking")}</Link>}
        {show("/teams") && <Link href="/teams" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.teams")}</Link>}
        {show("/impressum") && <Link href="/impressum" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.imprint")}</Link>}
        {show("/datenschutz") && <Link href="/datenschutz" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.privacy")}</Link>}
        {show("/agb") && <Link href="/agb" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.terms")}</Link>}
        {show("/hausordnung") && <Link href="/hausordnung" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.rules")}</Link>}
        {show("/matchmaking") && <Link href="/matchmaking" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.matchmaking")}</Link>}
        {show("/spieler") && <Link href="/spieler" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.players")}</Link>}
        {show("/hallen") && <Link href="/hallen" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.venues")}</Link>}
        {show("/mitspieler") && <Link href="/mitspieler" className="inline-flex min-h-11 items-center hover:text-ink">{t("footer.freePlayers")}</Link>}
        {show("/halle") && <Link href="/halle" className="inline-flex min-h-11 items-center hover:text-ink">Für Hallenbetreiber</Link>}
      </nav>
      <LanguageSwitch current={locale} label={t("footer.language")} />
    </footer>
  );
}
