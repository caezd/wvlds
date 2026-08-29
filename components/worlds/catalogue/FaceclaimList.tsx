"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Loader2, } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

// ── Faceclaims (annuaire en lecture seule) ────────────────────────────────────

type FaceclaimRow = { id: string; name: string; avatar_url: string | null; faceclaim: string };

export function FaceclaimList({ worldId }: { worldId: string }) {
  const t = useTranslations("catalogue");
  const [rows, setRows] = useState<FaceclaimRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("personas")
        .select("id, name, avatar_url, faceclaim")
        .eq("world_id", worldId)
        .not("faceclaim", "is", null)
        .neq("faceclaim", "");
      const sorted = ((data ?? []) as FaceclaimRow[])
        .filter(p => !!p.faceclaim?.trim())
        .sort((a, b) => a.faceclaim.localeCompare(b.faceclaim, "fr", { sensitivity: "base" }));
      setRows(sorted);
      setLoading(false);
    }
    void load();
  }, [worldId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground/60">
        {t("emptyFaceclaims")}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map(p => (
        <div key={p.id} className="flex items-center gap-2 px-2 py-1.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
            {p.avatar_url ? (
              <Image src={p.avatar_url} alt="" fill sizes="32px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug truncate">{p.faceclaim}</p>
            <p className="text-xs text-muted-foreground truncate">{p.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

