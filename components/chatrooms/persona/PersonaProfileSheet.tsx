"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TabBar } from "@/components/ui/tab-bar";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Persona } from "@/types/db";
import type { PersonaSection, PersonaSectionField, PersonaSectionWithFields, PersonaFieldData, InventoryItem, SkillItem, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
import { Coins, Flame, X, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";
import { supabaseThumb } from "@/lib/storage";
import { getInitials } from "@/lib/textFormatting";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getUsablePersonaIds } from "@/lib/personaEligibility";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

// -- Level helpers --------------------------------------------
// level = floor(sqrt(xp / 50)) + 1
// xp needed for level N = (N-1)² × 50
function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const xpForCurrent = (level - 1) * (level - 1) * 50;
  const xpForNext = level * level * 50;
  const progress = xpForNext > xpForCurrent
    ? ((xp - xpForCurrent) / (xpForNext - xpForCurrent)) * 100
    : 100;
  return { level, xpForCurrent, xpForNext, progress: Math.min(progress, 100) };
}

type Balance = {
  xp: number;
  coins: number;
  streak_current: number;
};

// -- Timeline collapsible -------------------------------------
function TimelineView({ items }: { items: TimelineItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <TimelineItemRow key={item.id} item={item} isLast={i === items.length - 1} />
      ))}
    </div>
  );
}

function TimelineItemRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
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

// -- Read-only field renderer ---------------------------------
type FieldData = PersonaFieldData | null | undefined;

function FieldView({ type, data }: { type: string; data: FieldData }) {
  if (type === "title") {
    return (
      <h3 className="text-xl font-semibold text-foreground">
        {data?.text || ""}
      </h3>
    );
  }
  if (type === "text") {
    return data?.text ? (
      <MarkdownRenderer content={data.text} className="text-sm" />
    ) : null;
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
                    <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={28} height={28} className="h-7 w-7 object-contain dark:invert shrink-0" />
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
    return <TimelineView items={visible} />;
  }
  if (type === "dl") {
    const items: DlItem[] = data?.dlItems ?? [];
    const visible = items.filter((it) => it.label || it.description);
    if (!visible.length) return null;
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {visible.map((item) => (
          <Fragment key={item.id}>
            <dt className="text-left font-semibold">{item.label}</dt>
            <dd className="text-muted-foreground">{item.description}</dd>
          </Fragment>
        ))}
      </dl>
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
              <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={20} height={20} className="h-5 w-5 object-contain dark:invert shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-tight">{item.name}</span>
                {item.level && (
                  <span className="shrink-0 rounded-full border border-border-soft bg-muted/50 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground tabular-nums">
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
  return null;
}

// -- Main component -------------------------------------------
type Props = {
  persona: Persona | null;
  selfId: string | null;
  onClose: () => void;
  onUsePersona?: (p: Persona) => void;
};

export function PersonaProfileSheet({ persona, selfId, onClose, onUsePersona }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { plan } = useCurrentUser();
  const t = useTranslations("personas");

  const { getUserPresence } = useGlobalPresence();

  const [balance, setBalance] = useState<Balance | null>(null);
  // Éligibilité (plan gratuit : 5 personas les plus anciens par monde) — ne
  // concerne que le persona du viewer lui-même (cf. migration 090).
  const [usableForSelf, setUsableForSelf] = useState(true);
  const [sections, setSections] = useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerThumbFailed, setBannerThumbFailed] = useState(false);
  const [_frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    setBannerThumbFailed(false);
  }, [bannerUrl]);
  const [ownerPresence, setOwnerPresence] = useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);

  useEffect(() => {
    if (!persona) {
      setBalance(null);
      setSections([]);
      setActiveTab(null);
      setOwnerPresence(null);
      setBannerUrl(null);
      setFrameUrl(null);
      setUsableForSelf(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setUsableForSelf(true); // par défaut : pas de verrou tant que le check n'a pas résolu

    async function load() {
      // bannière + cadre du persona
      const { data: personaRow } = await supabase
        .from("personas")
        .select("banner_url, frame:avatar_frame_id(asset_url), world_id")
        .eq("id", persona!.id)
        .maybeSingle();

      // Éligibilité (uniquement pour le persona du viewer lui-même) : les
      // frères/sœurs non-templates du même monde suffisent à reproduire
      // exactement le calcul de getUsablePersonaIds (voir PersonaPickerDialog).
      let usableForSelfResult = true;
      const worldId = (personaRow as unknown as { world_id?: string | null } | null)?.world_id;
      if (persona!.user_id === selfId && worldId) {
        const { data: siblings } = await supabase
          .from("personas")
          .select("id, created_at, is_template")
          .eq("user_id", selfId!)
          .eq("world_id", worldId);
        usableForSelfResult = getUsablePersonaIds(siblings ?? [], plan).has(persona!.id);
      }

      // gamification balance
      const { data: bal } = await supabase
        .from("gamification_balances")
        .select("xp, coins, streak_current")
        .eq("user_id", persona!.user_id)
        .maybeSingle();

      // présence persistée du propriétaire (pour "vu il y a X")
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("last_seen_at, appear_offline")
        .eq("id", persona!.user_id)
        .maybeSingle();

      // sections + fields
      const { data: secs } = await supabase
        .from("persona_sections")
        .select("id, persona_id, name, position")
        .eq("persona_id", persona!.id)
        .order("position", { ascending: true });

      let sectionsWithFields: PersonaSectionWithFields[] = [];
      if (secs?.length) {
        const sectionIds = (secs as PersonaSection[]).map((s) => s.id);
        const { data: fields } = await supabase
          .from("persona_section_fields")
          .select("id, section_id, type, position, data")
          .in("section_id", sectionIds)
          .order("position", { ascending: true });

        sectionsWithFields = (secs as PersonaSection[]).map((s) => ({
          ...s,
          fields: ((fields ?? []) as PersonaSectionField[]).filter((f) => f.section_id === s.id),
        }));
      }

      if (cancelled) return;
      const row = personaRow as unknown as { banner_url?: string | null; frame?: { asset_url?: string | null } | null } | null;
      setBannerUrl(row?.banner_url ?? null);
      setFrameUrl(row?.frame?.asset_url ?? null);
      setUsableForSelf(usableForSelfResult);
      setBalance(bal ?? null);
      setOwnerPresence(
        ownerProfile
          ? {
              last_seen_at:
                (ownerProfile as unknown as { last_seen_at?: string | null })
                  .last_seen_at ?? null,
              appear_offline: !!(
                ownerProfile as unknown as { appear_offline?: boolean | null }
              ).appear_offline,
            }
          : null,
      );
      setSections(sectionsWithFields);
      setActiveTab(sectionsWithFields[0]?.id ?? null);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [persona?.id, selfId, plan, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const xpInfo = balance ? levelFromXp(balance.xp) : null;

  const userPresence = persona ? getUserPresence(persona.user_id) : "offline";
  const _isOnline = userPresence === "online";
  const presenceLine =
    !persona
      ? null
      : !ownerPresence && userPresence === "offline"
        ? null // données pas encore chargées
        : userPresence === "online"
          ? "En ligne"
          : userPresence === "away"
            ? "Absent"
            : ownerPresence?.appear_offline
              ? "Hors ligne"
              : ownerPresence?.last_seen_at
                ? `Vu ${formatLastSeen(ownerPresence.last_seen_at)}`
                : "Hors ligne";

  return (
    <Drawer open={!!persona} onOpenChange={(o) => !o && onClose()} swipeDirection="right">
      <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0 w-[min(calc(100%_-_var(--drawer-inset)*2),_380px)] touch:w-[min(calc(100%_-_var(--drawer-inset)*2),_440px)]">
        {persona && (
          <>
            <DrawerClose
              aria-label="Fermer"
              className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="size-4" />
            </DrawerClose>
            <DrawerHeader className="sr-only">
              <DrawerTitle>{persona.name}</DrawerTitle>
              <DrawerDescription>{t("profileSheetDescription")}</DrawerDescription>
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto">
            {/* -- Bannière -- */}
            {bannerUrl ? (
              <div className="relative h-34 w-full shrink-0">
                <Image
                  src={bannerThumbFailed ? bannerUrl : (supabaseThumb(bannerUrl, 880, 80, 272) ?? bannerUrl)}
                  onError={() => setBannerThumbFailed(true)}
                  alt=""
                  fill
                  sizes="440px"
                  className="object-cover"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="h-34 w-full shrink-0 bg-gradient-to-r from-muted/60 to-muted" />
            )}

            {/* -- Header stats -- */}
            <div className="px-5 pt-5 pb-4 border-b border-border-soft space-y-3">
              {xpInfo && balance ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">
                      Niveau {xpInfo.level}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {balance.xp} / {xpInfo.xpForNext} XP
                    </span>
                  </div>
                  {/* XP bar */}
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${xpInfo.progress}%` }}
                    />
                  </div>
                  {/* Coins + streak */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Coins className="h-4 w-4" />
                      {balance.coins.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-orange-400">
                      <Flame className="h-4 w-4" />
                      {balance.streak_current} j.
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                      <Zap className="h-4 w-4" />
                      {balance.xp} XP
                    </span>
                  </div>
                </>
              ) : loading ? (
                <div className="h-8 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-xs text-muted-foreground">Aucune donnée de progression.</p>
              )}
            </div>

            {/* -- Avatar + nom -- */}
            <div className="flex flex-col items-center gap-2 py-6 border-b border-border-soft">
              <AvatarWithFrame
                src={persona.avatar_url}
                alt={persona.name}
                fallback={getInitials(persona.name)}
                presenceState="invisible"
                size={80}
                className="outline-4 outline-background rounded-2xl"
              />
              <div className="text-center">
                <div className="text-lg font-semibold">{persona.name}</div>
                {presenceLine && (
                  <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        userPresence === "online" ? "bg-[#58F4A8]"
                        : userPresence === "away" ? "bg-orange-400"
                        : "bg-muted-foreground/40"
                      }`}
                    />
                    {presenceLine}
                  </div>
                )}
                {persona.user_id === selfId && (
                  <div className="text-xs text-muted-foreground">Votre persona</div>
                )}
              </div>
              {onUsePersona && (
                persona.user_id === selfId && !usableForSelf ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled
                        className="mt-1 flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium opacity-50 cursor-not-allowed"
                      >
                        <Lock className="h-3 w-3" />
                        Utiliser ce persona
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-56 text-center">
                      {t("lockedHint")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    className="mt-1 rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    onClick={() => { onUsePersona(persona); onClose(); }}
                  >
                    Utiliser ce persona
                  </button>
                )
              )}
            </div>

            {/* -- Sections -- */}
            {sections.length > 0 && (
              <div className="flex-1">
                <Tabs
                  value={activeTab ?? sections[0].id}
                  onValueChange={setActiveTab}
                >
                  <TabBar className="px-5">
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
                      className="px-5 py-4 space-y-4 data-[state=inactive]:hidden"
                      forceMount
                    >
                      {s.fields.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Aucun contenu.
                        </p>
                      ) : (
                        s.fields.map((f) => (
                          <FieldView key={f.id} type={f.type} data={f.data} />
                        ))
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            {loading && sections.length === 0 && (
              <div className="flex-1 space-y-2 px-5 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-muted" />
                ))}
              </div>
            )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
