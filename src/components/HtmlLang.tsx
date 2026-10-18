"use client";

import { useEffect } from "react";

/** Setzt das lang-Attribut der Seite passend zur gewählten Sprache (das Wurzel-Layout selbst bleibt vorab renderbar). */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
