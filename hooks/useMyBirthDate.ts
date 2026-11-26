"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdultIso } from "@/lib/age";
import { TABLE } from "@/lib/constants";

export type MyBirthDate =
  | { status: "loading"; birthDate: null }
  | { status: "unknown"; birthDate: null }
  | { status: "adult" | "minor"; birthDate: string };

/**
 * La date de naissance enregistrée du compte (migration 266), lue dans
 * `profile_birth_dates`, dont la RLS ne laisse voir que sa propre ligne.
 * Sans date, ou si la lecture échoue : « unknown », la date sera demandée.
 */
export function useMyBirthDate({ enabled = true }: { enabled?: boolean } = {}): MyBirthDate {
  const [state, setState] = useState<MyBirthDate>({ status: "loading", birthDate: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void createClient()
      .from(TABLE.PROFILE_BIRTH_DATES)
      .select("birth_date")
      .maybeSingle()
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return;
        const birthDate = (data as { birth_date?: string } | null)?.birth_date;
        if (error || !birthDate) setState({ status: "unknown", birthDate: null });
        else setState({ status: isAdultIso(birthDate) ? "adult" : "minor", birthDate });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
