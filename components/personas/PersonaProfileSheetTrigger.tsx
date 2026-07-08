"use client";

import * as React from "react";
import Image from "next/image";
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
import type { PersonaSection, PersonaSectionField, PersonaSectionWithFields, PersonaFieldData, InventoryItem, SkillItem, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatLastSeen, cn } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";
import { TABLE } from "@/lib/constants";

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

type FieldData = PersonaFieldData | null | undefined;

function FieldView({ type, data }: { type: string; data: FieldData }) {
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
  if (type === "inventory") {
    const items: InventoryItem[] = data?.inventoryItems ?? [];
    const visible = items.filter((it) => it.name);
    if (!visible.length) return null;
    return (
      <div className="rounded-lg border border-border-soft bg-muted/30 p-3">
        <div className="flex flex-wrap gap-2">
          {visible.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 rounded-md border border-border-soft bg-background px-2 py-1.5 cursor-default select-none">
                  {item.icon && (
                    <Image src={`/rpg_icons/${item.icon}`} alt="" width={28} height={28} className="h-7 w-7 object-contain dark:invert shrink-0" />
                  )}
                  <span className="text-sm font-medium leading-none">{item.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">x {item.quantity ?? 1}</span>
                </div>
              </TooltipTrigger>
              {item.description && (
                <TooltipContent side="top" className="max-w-[200px] text-center">
                  {item.description}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </div>
      </div>
    );
  }
  if (type === "skills") {
    const items: SkillItem[] = data?.skillItems ?? [];
    const visible = items.filter((it) => it.name);
    if (!visible.length) return null;
    return (
      <div className="space-y-2">
        {visible.map((item) => (
          <div key={item.id} className="flex items-start gap-2.5 rounded-lg border border-border-soft bg-muted/30 px-3 py-2">
            {item.icon && (
              <Image src={`/rpg_icons/${item.icon}`} alt="" width={20} height={20} className="h-5 w-5 object-contain dark:invert shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-tight">{item.name}</span>
                {item.level && (
                  <span className="shrink-0 rounded-full border border-border-soft bg-muted/50 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                    {item.level}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === "gauges") {
    const items: GaugeItem[] = data?.gaugeItems ?? [];
    const visible = items.filter((it) => it.name);
    if (!visible.length) return null;
    return (
      <div className="space-y-3">
        {visible.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="tabular-nums text-muted-foreground text-xs">{item.value} / {item.max}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((item.value ?? 0) / (item.max || 1)) * 100)}%`,
                  backgroundColor: item.color ?? "#6366f1",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === "quote") {
    if (!data?.quoteText) return null;
    return (
      <blockquote className="border-l-2 border-primary/40 pl-4 space-y-1">
        <MarkdownRenderer content={data.quoteText as string} className="text-sm italic" />
        {data.quoteSource && (
          <p className="text-xs text-muted-foreground">— {data.quoteSource as string}</p>
        )}
      </blockquote>
    );
  }
  if (type === "traits") {
    const items: TraitItem[] = data?.traitItems ?? [];
    const visible = items.filter((it) => it.label);
    if (!visible.length) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <span
            key={item.id}
            className="rounded-full border border-border-soft bg-muted/40 px-3 py-1 text-xs font-medium"
          >
            {item.label}
          </span>
        ))}
      </div>
    );
  }
  if (type === "timeline") {
    const items: TimelineItem[] = data?.timelineItems ?? [];
    const visible = items.filter((it) => it.title);
    if (!visible.length) return null;
    return <TriggerTimelineView items={visible} />;
  }
  if (type === "dl") {
    const items: DlItem[] = data?.dlItems ?? [];
    const visible = items.filter((it) => it.label || it.description);
    if (!visible.length) return null;
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {visible.map((item) => (
          <React.Fragment key={item.id}>
            <dt className="text-left font-semibold">{item.label}</dt>
            <dd className="text-muted-foreground">{item.description}</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return null;
}

function TriggerTimelineItemRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/50" />
        {!isLast && <div className="flex-1 w-px bg-border mt-1" />}
      </div>
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-baseline gap-2">
          {item.date && (
            <span className="text-[0.65rem] text-muted-foreground shrink-0">{item.date}</span>
          )}
          <span className="text-sm font-medium leading-tight">{item.title}</span>
          {item.description && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? "Réduire" : "Voir"}
            </button>
          )}
        </div>
        {expanded && item.description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        )}
      </div>
    </div>
  );
}

function TriggerTimelineView({ items }: { items: TimelineItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <TriggerTimelineItemRow key={item.id} item={item} isLast={i === items.length - 1} />
      ))}
    </div>
  );
}

export function PersonaProfileSheetTrigger({
  children,
  personaId,
  userId,
  label,
  hoverPreview = false,
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
  const { getUserPresence } = useGlobalPresence();
  const { userId: viewerId } = useCurrentUser();
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState<string | null>(label ?? null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null);
  const [bannerThumbFailed, setBannerThumbFailed] = React.useState(false);

  React.useEffect(() => {
    setBannerThumbFailed(false);
  }, [bannerUrl]);
  const [_frameUrl, setFrameUrl] = React.useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = React.useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);
  const [balance, setBalance] = React.useState<BalanceSummary | null>(null);
  const [sections, setSections] = React.useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isFollowing, setIsFollowing] = React.useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = React.useState(false);

  // Évite les double-fetch : on ne charge qu'une fois par (personaId+userId)
  const fetchedKeyRef = React.useRef<string | null>(null);

  const prefetch = React.useCallback(() => {
    if (!personaId) return;
    const key = `${personaId}:${userId ?? ""}:${viewerId ?? ""}`;
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

      if (viewerId && userId && viewerId !== userId) {
        const { data: followRow } = await supabase
          .from(TABLE.PERSONA_FOLLOWS)
          .select("persona_id")
          .eq("persona_id", personaId!)
          .eq("follower_id", viewerId)
          .maybeSingle();
        if (!cancelled) setIsFollowing(!!followRow);
      } else if (!cancelled) {
        setIsFollowing(null);
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
        const ids = (secs as PersonaSection[]).map((s) => s.id);
        const { data: fields } = await supabase
          .from("persona_section_fields")
          .select("id,section_id,type,position,data")
          .in("section_id", ids)
          .order("position", { ascending: true });

        const withFields: PersonaSectionWithFields[] = (secs as PersonaSection[]).map((s) => ({
          ...s,
          fields: ((fields ?? []) as PersonaSectionField[]).filter((f) => f.section_id === s.id),
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
  }, [personaId, userId, viewerId, supabase, label]);

  async function toggleFollow() {
    if (!personaId || !viewerId || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    const { error } = wasFollowing
      ? await supabase.from(TABLE.PERSONA_FOLLOWS).delete().eq("persona_id", personaId).eq("follower_id", viewerId)
      : await supabase.from(TABLE.PERSONA_FOLLOWS).insert({ persona_id: personaId, follower_id: viewerId });
    if (error) {
      setIsFollowing(wasFollowing);
      toast.error(error.message ?? "Action impossible.");
    }
    setFollowBusy(false);
  }

  // Prefetch dès que la sheet s'ouvre (fallback si le hover n'a pas suffi)
  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

  const info = balance ? levelInfo(balance.xp) : null;

  const userPresence = userId ? getUserPresence(userId) : "offline";
  const presenceLine =
    !ownerPresence && userPresence === "offline"
      ? null // données pas encore chargées — on n'affiche rien
      : userPresence === "online"
        ? "En ligne"
        : userPresence === "away"
          ? "Absent"
          : ownerPresence?.appear_offline
            ? "Hors ligne"
            : ownerPresence?.last_seen_at
              ? `Vu ${formatLastSeen(ownerPresence.last_seen_at)}`
              : "Hors ligne"; // last_seen_at null (compte ancien ou sans activité récente)

  const TriggerButton = (
    <button
      type="button"
      className="size-12"
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
              <div className="relative h-34 w-full">
                <Image
                  src={bannerThumbFailed ? bannerUrl : (supabaseThumb(bannerUrl, 880, 80, 272) ?? bannerUrl)}
                  onError={() => setBannerThumbFailed(true)}
                  alt=""
                  fill
                  sizes="768px"
                  className="object-cover"
                  draggable={false}
                />
              </div>
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
                    className="outline-4 outline-background rounded-2xl"
                  />
                </div>

                {/* Nom + stats */}
                <div className="pb-1 min-w-0 flex-1">
                  <div className="h-16 pb-2 mb-2 flex items-end justify-between gap-3">
                    <p className="min-w-0 text-xl font-semibold leading-tight truncate">
                      {name ?? label ?? "—"}
                    </p>
                    {isFollowing !== null && (
                      <button
                        type="button"
                        onClick={toggleFollow}
                        disabled={followBusy}
                        className={cn(
                          "shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                          isFollowing ? "bg-muted" : "hover:bg-muted",
                        )}
                      >
                        {isFollowing ? "Suivi" : "Suivre"}
                      </button>
                    )}
                  </div>
                  {presenceLine && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${userPresence === "online" ? "bg-[#58F4A8]"
                          : userPresence === "away" ? "bg-orange-400"
                            : "bg-muted-foreground/40"
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
