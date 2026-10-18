export const MIN_AGE = 16;

/** Alter in vollen Jahren zum Stichtag. */
export function ageOn(birthDate: Date, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthday =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() >= birthDate.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

export function isOldEnough(birthDate: Date, today: Date = new Date()): boolean {
  return ageOn(birthDate, today) >= MIN_AGE;
}
