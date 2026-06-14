"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TabBar } from "@/components/ui/tab-bar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { Coins, Flame, Zap } from "lucide-react";
import type { PersonaSectionWithFields } from "@/types/personas";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";

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
  if (type === "separator") {
    return <div className="h-px w-full bg-border my-8" />;
  }
  if (type === "stats") {
    const items: { id: string; label: string; value: string; unit?: string }[] =
      data?.items ?? [];
    const visible = items.filter((it) => it.label || it.value);
    if (!visible.length) return null;
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
        {visible.map((stat) => (
          <div
            key={stat.id}
            className="flex flex-col justify-end gap-0.5 rounded-lg border border-border-soft bg-muted/30 px-3 py-2"
          >
            {stat.label ? (
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
            ) : null}
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-lg font-semibold tabular-nums">
                {stat.value}
              </span>
              {stat.unit ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {stat.unit}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === "image-grid") {
    return <ImageGridView images={data?.images ?? []} />;
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
  const { onlineUsers } = useGlobalPresence();
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState<string | null>(label ?? null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null);
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = React.useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);
  const [balance, setBalance] = React.useState<BalanceSummary | null>(null);
  const [sections, setSections] = React.useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Évite les double-fetch : on ne charge qu'une fois par (personaId+userId)
  const fetchedKeyRef = React.useRef<string | null>(null);

  const prefetch = React.useCallback(() => {
    if (!personaId) return;
    const key = `${personaId}:${userId ?? ""}`;
    if (fetchedKeyRef.current === key) return; // déjà chargé
    fetchedKeyRef.current = key;

    let cancelled = false;
    setLoading(true);

    async function load() {
      const { data: persona, error } = await supabase
        .from("personas")
        .select("id,user_id,name,avatar_url,banner_url,frame:avatar_frame_id(asset_url)")
        .eq("id", personaId!)
        .maybeSingle();

      if (error) { toast.error(error.message ?? "Impossible de charger le profil."); fetchedKeyRef.current = null; return; }
      if (!cancelled && persona) {
        const row = persona as unknown as { name?: string | null; avatar_url?: string | null; banner_url?: string | null; frame?: { asset_url?: string | null } | null };
        setName(row.name ?? label ?? null);
        setAvatarUrl(row.avatar_url ?? null);
        setBannerUrl(row.banner_url ?? null);
        setFrameUrl(row.frame?.asset_url ?? null);
      }

      if (userId) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("last_seen_at, appear_offline")
          .eq("id", userId)
          .maybeSingle();
        if (!cancelled && ownerProfile) {
          const row = ownerProfile as unknown as {
            last_seen_at?: string | null;
            appear_offline?: boolean | null;
          };
          setOwnerPresence({
            last_seen_at: row.last_seen_at ?? null,
            appear_offline: !!row.appear_offline,
          });
        }

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
  }, [personaId, userId, supabase, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch dès que la sheet s'ouvre (fallback si le hover n'a pas suffi)
  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

  const info = balance ? levelInfo(balance.xp) : null;

  const isOnline = !!userId && !!onlineUsers[userId];
  const presenceLine =
    !ownerPresence && !isOnline
      ? null // données pas encore chargées — on n'affiche rien
      : isOnline
        ? "En ligne"
        : ownerPresence?.appear_offline
          ? "Hors ligne"
          : ownerPresence?.last_seen_at
            ? `Vu ${formatLastSeen(ownerPresence.last_seen_at)}`
            : "Hors ligne"; // last_seen_at null (compte ancien ou sans activité récente)

  const TriggerButton = (
    <button
      type="button"
      className="size-12 sticky top-4"
      title={label ?? "Voir le profil"}
      aria-label={label ?? "Voir le profil"}
      onPointerEnter={prefetch}
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

        {/* -- Header : banner + avatar + nom + stats -- */}
        <div>
          <div className="relative overflow-hidden">
            {/* Banner */}
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supabaseThumb(bannerUrl, 880, 80, 272) ?? bannerUrl} onError={(e) => { e.currentTarget.src = bannerUrl!; e.currentTarget.onerror = null; }} alt="" className="h-34 w-full object-cover" draggable={false} />
            ) : (
              <div className="h-34 bg-gradient-to-r from-muted/60 to-muted" />
            )}

            <div className="px-4 pb-4 -mt-16">
              <div className="relative flex items-start gap-4">
                {/* Avatar */}
                <div className="shrink-0 mt-2">
                  <AvatarWithFrame
                    src={avatarUrl}
                    alt={name ?? ""}
                    fallback={name ? initials(name) : "?"}
                    presenceState="invisible"
                    size={128}
                    frameUrl={frameUrl}
                    className="outline-4 outline-background rounded-2xl"
                  />
                </div>

                {/* Nom + stats */}
                <div className="pb-1 min-w-0 flex-1">
                  <p className="h-16 pb-2 mb-2 flex items-end text-xl font-semibold leading-tight truncate">
                    {name ?? label ?? "—"}
                  </p>
                  {presenceLine && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${isOnline ? "bg-[#58F4A8]" : "bg-muted-foreground/40"
                          }`}
                      />
                      {presenceLine}
                    </p>
                  )}

                  {info && balance ? (
                    <div className="space-y-1">
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

        {/* -- Sections (read-only) -- */}
        <div className="space-y-4">
          {sections.length > 0 ? (
            <Tabs
              value={activeTab ?? sections[0].id}
              onValueChange={setActiveTab}
              className="space-y-4"
            >
              <TabBar>
                {sections.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabBar>

              {sections.map((s) => (
                <TabsContent
                  key={s.id}
                  value={s.id}
                  forceMount
                  className="px-4 space-y-4 data-[state=inactive]:hidden"
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
