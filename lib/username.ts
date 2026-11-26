/**
 * Le format d'un pseudo : lettres sans accent, chiffres et tiret bas, de 3 à
 * 32 caractères. Miroir de la contrainte `profiles_username_format` et de
 * `is_username_available` (migration 266).
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

export type UsernameProblem = "empty" | "spaces" | "invalidChars" | "tooShort" | "tooLong";

/** Ce qui cloche dans un pseudo, dans l'ordre où il vaut mieux le dire ; null s'il est bien formé. */
export function usernameProblem(value: string): UsernameProblem | null {
  if (value === "") return "empty";
  if (/\s/.test(value)) return "spaces";
  if (!/^[A-Za-z0-9_]*$/.test(value)) return "invalidChars";
  if (value.length < USERNAME_MIN) return "tooShort";
  if (value.length > USERNAME_MAX) return "tooLong";
  return null;
}
