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
