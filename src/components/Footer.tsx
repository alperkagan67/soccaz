import Link from "next/link";
import { getT } from "@/server/locale";
import { LanguageSwitch } from "./LanguageSwitch";

export async function Footer() {
  const { locale, t } = await getT();
  return (
    <footer className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-24 text-xs text-muted sm:px-6 sm:pb-8">
      <nav aria-label={t("footer.legal")} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4">
        <Link href="/hilfe" className="inline-block py-1.5 hover:text-ink">{t("footer.help")}</Link>
        <Link href="/kontakt" className="inline-block py-1.5 hover:text-ink">{t("footer.contact")}</Link>
        <Link href="/spiele" className="inline-block py-1.5 hover:text-ink">{t("nav.live")}</Link>
        <Link href="/rangliste" className="inline-block py-1.5 hover:text-ink">{t("nav.ranking")}</Link>
        <Link href="/teams" className="inline-block py-1.5 hover:text-ink">{t("footer.teams")}</Link>
        <Link href="/impressum" className="inline-block py-1.5 hover:text-ink">{t("footer.imprint")}</Link>
        <Link href="/datenschutz" className="inline-block py-1.5 hover:text-ink">{t("footer.privacy")}</Link>
        <Link href="/agb" className="inline-block py-1.5 hover:text-ink">{t("footer.terms")}</Link>
        <Link href="/hausordnung" className="inline-block py-1.5 hover:text-ink">{t("footer.rules")}</Link>
        <Link href="/matchmaking" className="inline-block py-1.5 hover:text-ink">{t("footer.matchmaking")}</Link>
        <Link href="/spieler" className="inline-block py-1.5 hover:text-ink">{t("footer.players")}</Link>
        <Link href="/hallen" className="inline-block py-1.5 hover:text-ink">{t("footer.venues")}</Link>
        <Link href="/mitspieler" className="inline-block py-1.5 hover:text-ink">{t("footer.freePlayers")}</Link>
        <Link href="/halle" className="inline-block py-1.5 hover:text-ink">Für Hallenbetreiber</Link>
      </nav>
      <LanguageSwitch current={locale} label={t("footer.language")} />
    </footer>
  );
}
