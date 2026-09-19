/**
 * Dates relatives et heures locales, dans la langue de l'interface.
 *
 * `Intl` fait tout le travail : pas de bibliothèque de dates, et pas de
 * français en dur comme dans `formatLastSeen` (lib/utils.ts), qu'il remplace
 * progressivement.
 */

/** « il y a 3 min », « hier », « il y a 12 j » ; une date au-delà d'un mois. */
export function relativeTime(iso: string, locale: string, justNow: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.floor(h / 24);
  if (d < 30) return rtf.format(-d, "day");
  return new Date(iso).toLocaleDateString(locale);
}

/** L'heure qu'il est dans ce fuseau, « 21:30 » ; `null` si le fuseau est inconnu du navigateur. */
export function localTimeIn(timezone: string, locale: string, now: Date = new Date()): string | null {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(now);
  } catch {
    return null;
  }
}

/** Les fuseaux connus du navigateur, ou une liste courte quand l'API manque (jsdom). */
export function supportedTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.("timeZone");
    if (list && list.length > 0) return list;
  } catch {
    /* API absente */
  }
  return ["UTC", "Europe/Paris", "Europe/London", "America/Montreal", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"];
}

/** Le fuseau du navigateur, ou `null`. */
export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Jours restants avant le prochain anniversaire (0 = aujourd'hui), l'année
 * ignorée : un 29 février tombe le 1er mars les années sans.
 */
export function daysUntilBirthday(month: number, day: number, now: Date = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let next = Date.UTC(now.getFullYear(), month - 1, day);
  if (next < today) next = Date.UTC(now.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / 86_400_000);
}

/** « 12 oct. » — le jour et le mois, sans année. */
export function formatBirthday(month: number, day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2001, month - 1, day)),
  );
}
