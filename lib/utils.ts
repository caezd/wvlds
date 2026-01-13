import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function formatDaysAgo(date) {
  const now = new Date();
  const diffInMs = date - now;
  // Calculate difference in days (milliseconds per day: 1000 * 60 * 60 * 24)
  const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
  return rtf.format(diffInDays, "day");
}
