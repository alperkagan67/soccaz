import Link from "next/link";
import { getT } from "@/server/locale";
import { LanguageSwitch } from "./LanguageSwitch";

export async function Footer() {
  const { locale, t } = await getT();
  return (
    <footer className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-24 text-xs text-muted sm:px-6 sm:pb-8">
      <nav aria-label={t("footer.legal")} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4">
        <Link href="/impressum" className="hover:text-ink">{t("footer.imprint")}</Link>
        <Link href="/datenschutz" className="hover:text-ink">{t("footer.privacy")}</Link>
        <Link href="/agb" className="hover:text-ink">{t("footer.terms")}</Link>
        <Link href="/hausordnung" className="hover:text-ink">{t("footer.rules")}</Link>
        <Link href="/matchmaking" className="hover:text-ink">{t("footer.matchmaking")}</Link>
        <Link href="/ligen" className="hover:text-ink">{t("footer.leagues")}</Link>
        <Link href="/turniere" className="hover:text-ink">{t("footer.tournaments")}</Link>
        <Link href="/profitag" className="hover:text-ink">{t("footer.proDay")}</Link>
        <Link href="/spieler" className="hover:text-ink">{t("footer.players")}</Link>
        <Link href="/hallen" className="hover:text-ink">{t("footer.venues")}</Link>
        <Link href="/mitspieler" className="hover:text-ink">{t("footer.freePlayers")}</Link>
      </nav>
      <LanguageSwitch current={locale} label={t("footer.language")} />
    </footer>
  );
}
