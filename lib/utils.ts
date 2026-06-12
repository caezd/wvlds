import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** "à l'instant", "il y a 5 min", "il y a 3 h", sinon date relative en jours */
export function formatLastSeen(date: Date | string | number) {
  const diffMs = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return formatDaysAgo(date);
}

export function formatDaysAgo(date: Date | string | number) {
  const now = new Date();
  const diffInMs = new Date(date).getTime() - now.getTime();
  // Calculate difference in days (milliseconds per day: 1000 * 60 * 60 * 24)
  const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
  return rtf.format(diffInDays, "day");
}
