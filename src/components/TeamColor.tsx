import { colorByKey, effectiveColorKey } from "@/lib/team-color";

/** Kleine Farbmarke in der Teamfarbe (Vertrag 007). Nur Identität, nie Funktion: der Teamname steht immer als Text daneben. Ohne gewählte Farbe gilt die Standardfarbe aus dem Slug. */
export function TeamColorDot({ color, slug, className = "" }: { color: string | null | undefined; slug: string; className?: string }) {
  const key = effectiveColorKey(color, slug);
  const c = colorByKey(key)!;
  return <span aria-hidden="true" data-testid="team-color-dot" data-color={key} title={c.name} className={`inline-block size-3 shrink-0 rounded-full border border-line align-middle ${className}`} style={{ backgroundColor: c.hex }} />;
}
