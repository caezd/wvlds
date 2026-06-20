"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type CurrentUser = {
  user: User | null;
  userId: string | null;
  username: string | null;
  loading: boolean;
};

export function useCurrentUser(): CurrentUser {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
      const u = res.data.user ?? null;
      setUser(u);
      setLoading(false);
      if (u?.id) {
        supabase.from("profiles").select("username").eq("id", u.id).single()
          .then(({ data }: { data: { username: string | null } | null }) => setUsername(data?.username ?? null));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_: string, session: Session | null) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u?.id) {
        supabase.from("profiles").select("username").eq("id", u.id).single()
          .then(({ data }: { data: { username: string | null } | null }) => setUsername(data?.username ?? null));
      } else {
        setUsername(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return { user, userId: user?.id ?? null, username, loading };
}
