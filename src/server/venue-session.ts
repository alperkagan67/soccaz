import { notFound } from "next/navigation";
import { requireUser } from "./session";
import { isVenueManager } from "./venue-access-rules";

/** Bereich /halle: nur mit Zugang zu mindestens einer Halle, sonst 404 (Vertrag 011 AC-1). Die Berechtigung kommt aus der Datenbank, nie aus der Sitzung. */
export async function requireVenueManager(next: string) {
  const user = await requireUser(next);
  if (!(await isVenueManager(user.id))) notFound();
  return user;
}
