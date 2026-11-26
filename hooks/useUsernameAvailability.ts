"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usernameProblem, type UsernameProblem } from "@/lib/username";

export type UsernameAvailability =
  | { status: "idle" }
  | { status: "invalid"; problem: Exclude<UsernameProblem, "empty"> }
  | { status: "checking" | "available" | "taken" | "error" };

type Checked = { value: string; status: "available" | "taken" | "error" };

/**
 * Le pseudo saisi, vérifié en direct (migration 266) : le format tout de
 * suite, la disponibilité une fois la frappe arrêtée (`delay` ms), par
 * `is_username_available`, ouverte aux visiteurs non connectés. Une réponse
 * arrivée pour une valeur déjà remplacée est ignorée.
 */
export function useUsernameAvailability(
  value: string,
  { delay = 400 }: { delay?: number } = {},
): UsernameAvailability {
  const [checked, setChecked] = useState<Checked | null>(null);
  const problem = usernameProblem(value);

  useEffect(() => {
    if (problem) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void createClient()
        .rpc("is_username_available", { p_username: value })
        .then(({ data, error }: { data: unknown; error: unknown }) => {
          if (cancelled) return;
          setChecked({ value, status: error ? "error" : data === true ? "available" : "taken" });
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, problem, delay]);

  if (problem === "empty") return { status: "idle" };
  if (problem) return { status: "invalid", problem };
  if (checked?.value === value) return { status: checked.status };
  return { status: "checking" };
}
