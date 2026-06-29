"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useCurrentWorldId(): string | null {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const worldIdFromPath = pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
  const chatroomIdFromPath = pathname.match(/^\/c\/([^/]+)/)?.[1] ?? null;

  const [currentWorldId, setCurrentWorldId] = useState<string | null>(worldIdFromPath);

  useEffect(() => {
    if (worldIdFromPath) {
      setCurrentWorldId(worldIdFromPath);
    } else if (chatroomIdFromPath) {
      void (async () => {
        const { data } = await supabase
          .from("chatrooms")
          .select("world_id")
          .eq("id", chatroomIdFromPath)
          .maybeSingle();
        setCurrentWorldId((data as { world_id: string } | null)?.world_id ?? null);
      })();
    } else {
      setCurrentWorldId(null);
    }
  }, [worldIdFromPath, chatroomIdFromPath]); // eslint-disable-line react-hooks/exhaustive-deps

  return currentWorldId;
}
