import Link from "next/link";
import type { PersonRef } from "@/lib/lobby-namen";

/** Name einer Person in einer öffentlichen Liste: mit Link nur für Angemeldete, sonst Initialen als einfacher Text (AC-17). `linkClass` gilt nur für den Link. */
export function PersonName({ person, className = "", linkClass = "hover:text-accent-fg" }: { person: PersonRef; className?: string; linkClass?: string }) {
  return person.href ? (
    <Link href={person.href} className={`${className} ${linkClass}`.trim()} data-testid="person-name">{person.label}</Link>
  ) : (
    <span className={className || undefined} data-testid="person-name">{person.label}</span>
  );
}
