"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { Coins, Flame, Zap } from "lucide-react";
import type { PersonaSectionWithFields } from "@/types/personas";

function levelInfo(xp: number) {
  const level = Math.floor(xp / 100) + 1;
  const base = (level - 1) * 100;
  const progress = Math.min(100, Math.round(((xp - base) / 100) * 100));
  return { level, xpForNext: level * 100, progress };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type BalanceSummary = {
  xp: number;
  coins: number;
  streak_current: number;
  streak_longest: number;
};

function FieldView({ type, data }: { type: string; data: any }) {
  if (type === "title") {
    const text = data?.text as string | undefined;
    return text ? <h3 className="text-sm font-semibold text-foreground">{text}</h3> : null;
  }
  if (type === "text") {
    const text = data?.text as string | undefined;
    return text ? <MarkdownRenderer content={text} className="text-sm prose-sm" /> : null;
  }
  return null;
}

export function PersonaProfileSheetTrigger({
  children,
  personaId,
  userId,
  label,
  hoverPreview = true,
  side = "right",
}: {
  children: React.ReactNode;
  personaId?: string | null;
  userId?: string | null;
  label?: string | null;
  hoverPreview?: boolean;
  side?: "left" | "right" | "top" | "bottom";
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState<string | null>(label ?? null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<BalanceSummary | null>(null);
  const [sections, setSections] = React.useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !personaId) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      const { data: persona, error } = await supabase
        .from("personas")
        .select("id,user_id,name,avatar_url")
        .eq("id", personaId!)
        .maybeSingle();

      if (error) { toast.error(error.message ?? "Impossible de charger le profil."); return; }
      if (!cancelled && persona) {
        setName(persona.name ?? label ?? null);
        setAvatarUrl(persona.avatar_url ?? null);
      }

      if (userId) {
        const { data: bal } = await supabase.rpc("get_balance_summary", { p_user_id: userId });
        const row = Array.isArray(bal) ? bal?.[0] : bal;
        if (!cancelled && row) {
          setBalance({
            xp: Number(row.xp) || 0,
            coins: Number(row.coins) || 0,
            streak_current: Number(row.streak_current) || 0,
            streak_longest: Number(row.streak_longest) || 0,
          });
        }
      }

      const { data: secs } = await supabase
        .from("persona_sections")
        .select("id,persona_id,name,position")
        .eq("persona_id", personaId!)
        .order("position", { ascending: true });

      if (secs?.length) {
        const ids = secs.map((s) => s.id);
        const { data: fields } = await supabase
          .from("persona_section_fields")
          .select("id,section_id,type,position,data")
          .in("section_id", ids)
          .order("position", { ascending: true });

        const withFields: PersonaSectionWithFields[] = secs.map((s) => ({
          ...s,
          fields: (fields ?? []).filter((f) => f.section_id === s.id),
        }));

        if (!cancelled) {
          setSections(withFields);
          setActiveTab(withFields[0]?.id ?? null);
        }
      } else if (!cancelled) {
        setSections([]);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [open, personaId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) {
      setBalance(null);
      setSections([]);
      setActiveTab(null);
      setAvatarUrl(null);
    }
  }, [open]);

  const info = balance ? levelInfo(balance.xp) : null;

  const TriggerButton = (
    <button
      type="button"
      className="size-12 sticky top-4"
      title={label ?? "Voir le profil"}
      aria-label={label ?? "Voir le profil"}
      onClick={() => setOpen(true)}
    >
      {children}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {hoverPreview ? (
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>{TriggerButton}</HoverCardTrigger>
          <HoverCardContent className="w-64 p-3 space-y-2">
            <p className="text-sm font-medium truncate">{label ?? "Profil"}</p>
            {info && balance && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Niv. {info.level}</span>
                  <span>{balance.xp} / {info.xpForNext} XP</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${info.progress}%` }} />
                </div>
              </div>
            )}
          </HoverCardContent>
        </HoverCard>
      ) : (
        TriggerButton
      )}

      <SheetContent side={side} className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{name ?? label ?? "Profil persona"}</SheetTitle>
        </SheetHeader>

        {/* ── Header : banner + avatar + nom + stats ── */}
        <div>
          <div className="relative overflow-hidden">
            {/* Banner */}
            <div className="h-28 bg-gradient-to-r from-muted/60 to-muted" />

            <div className="px-4 pb-4">
              <div className="relative -mt-10 flex items-end gap-4">
                {/* Avatar */}
                <div className="h-20 w-20 rounded-full border-4 border-background bg-muted overflow-hidden shadow shrink-0">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={name ?? ""} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-lg font-semibold text-muted-foreground">
                      {name ? initials(name) : "?"}
                    </div>
                  )}
                </div>

                {/* Nom + stats */}
                <div className="pb-1 min-w-0 flex-1">
                  <p className="text-lg font-semibold leading-tight truncate">
                    {name ?? label ?? "—"}
                  </p>

                  {info && balance ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Niveau {info.level}</span>
                        <span>{balance.xp} / {info.xpForNext} XP</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${info.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs pt-0.5">
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Coins className="h-3.5 w-3.5" />
                          {balance.coins.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1 text-orange-400">
                          <Flame className="h-3.5 w-3.5" />
                          {balance.streak_current} j.
                        </span>
                        <span className="flex items-center gap-1 text-blue-400">
                          <Zap className="h-3.5 w-3.5" />
                          {balance.xp} XP
                        </span>
                      </div>
                    </div>
                  ) : loading ? (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
                      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sections (read-only) ── */}
        <div className="space-y-4">
          {sections.length > 0 ? (
            <Tabs
              value={activeTab ?? sections[0].id}
              onValueChange={setActiveTab}
              className="space-y-4"
            >
              <div className="flex items-center border-y">
                <TabsList className="rounded-none bg-transparent">
                  {sections.map((s) => (
                    <TabsTrigger key={s.id} value={s.id} className="px-3 rounded-xs">
                      {s.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {sections.map((s) => (
                <TabsContent
                  key={s.id}
                  value={s.id}
                  forceMount
                  className="px-4 space-y-3 data-[state=inactive]:hidden"
                >
                  {s.fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Aucun contenu.</p>
                  ) : (
                    s.fields.map((f) => (
                      <FieldView key={f.id} type={f.type} data={f.data} />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : !loading ? (
            <p className="px-4 text-sm text-muted-foreground italic">Aucune section.</p>
          ) : (
            <div className="px-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
