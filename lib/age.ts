export const MIN_AGE = 18;

/**
 * Vrai si la date de naissance (year/month/day, mois en 1-12) correspond à un
 * âge >= MIN_AGE à la date `now`. Rejette aussi les dates invalides
 * (ex. 31 février) et les dates dans le futur.
 */
export function isAdult(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const birth = new Date(year, month - 1, day);
  // Rejette les dates qui « débordent » (30 février → 2 mars) : le Date
  // reconstruit ne correspond alors pas aux composantes fournies.
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return false;
  }
  if (birth.getTime() > now.getTime()) return false;

  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1;
  }
  return age >= MIN_AGE;
}

/** La première année de naissance admise (miroir de `is_valid_birth_date`, migration 266). */
export const MIN_BIRTH_YEAR = 1900;

/**
 * La date de naissance au format AAAA-MM-JJ, ou null si elle n'existe pas
 * (31 février), est dans le futur ou avant 1900.
 */
export function birthDateFromParts(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;
  if (year < MIN_BIRTH_YEAR || birth.getTime() > now.getTime()) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `isAdult` pour une date AAAA-MM-JJ. */
export function isAdultIso(iso: string, now: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  return isAdult(Number(m[1]), Number(m[2]), Number(m[3]), now);
}
