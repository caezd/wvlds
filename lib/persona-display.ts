// Helpers d'affichage des personas (pur, testable).

/** Initiales d'un nom (1 à 2 lettres majuscules) pour l'avatar de repli. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "P";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}
