"use client";

import * as React from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import type { PersonaSection, PersonaSectionField, PersonaSectionWithFields, PersonaFieldData, InventoryItem, SkillItem, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatLastSeen, cn } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";
import { TABLE } from "@/lib/constants";
import { getInitials } from "@/lib/textFormatting";

export type FieldData = PersonaFieldData | null | undefined;

/** Rendu lecture seule d'un champ de section — partagé avec l'aperçu affiché
 *  dans la sheet d'édition (voir PersonaEditSheet.tsx, bouton « Aperçu »),
 *  pour ne pas maintenir deux moteurs de rendu de champs en parallèle. */
export function FieldView({ type, data }: { type: string; data: FieldData }) {
  if (type === "title") {
    const text = data?.text as string | undefined;
    return text ? <h3 className="text-xl font-semibold text-foreground">{text}</h3> : null;
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

/** Formule d'affichage de la ligne de présence — extraite pour rester
 *  identique entre la fiche publique (PersonaProfileSheetTrigger) et
 *  l'aperçu affiché dans la sheet d'édition (PersonaEditSheet.tsx). */
export function formatPersonaPresenceLine(
  userPresence: "online" | "away" | "offline",
  ownerPresence: { last_seen_at: string | null; appear_offline: boolean } | null,
): string | null {
  if (!ownerPresence && userPresence === "offline") return null; // pas encore chargé
  if (userPresence === "online") return "En ligne";
  if (userPresence === "away") return "Absent";
  if (ownerPresence?.appear_offline) return "Hors ligne";
  if (ownerPresence?.last_seen_at) return `Vu ${formatLastSeen(ownerPresence.last_seen_at)}`;
  return "Hors ligne"; // last_seen_at null (compte ancien ou sans activité récente)
}

export type PersonaProfileBodyProps = {
  name: string | null;
  label?: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  frameUrl: string | null;
  dialogueColor: string | null;
  presenceLine: string | null;
  userPresence: "online" | "away" | "offline";
  isFollowing: boolean | null;
  followBusy: boolean;
  onToggleFollow: () => void;
  sections: PersonaSectionWithFields[];
  activeTab: string | null;
  onActiveTabChange: (id: string) => void;
  loading: boolean;
  /** Contenu additionnel superposé au coin de la bannière (ex. le bouton
   *  Aperçu/Éditer de PersonaEditSheet.tsx) — rendu après le contenu de la
   *  bannière pour rester visible par-dessus. */
  headerAction?: React.ReactNode;
};

/**
 * Rendu lecture seule complet d'une fiche persona (bannière + avatar/cadre +
 * nom + statut + sections) — partagé entre PersonaProfileSheetTrigger (fiche
 * ouverte depuis une chatroom) et l'aperçu de PersonaEditSheet.tsx, pour que
 * les deux affichent exactement la même chose.
 */
export function PersonaProfileBody({
  name,
  label,
  avatarUrl,
  bannerUrl,
  frameUrl,
  dialogueColor,
  presenceLine,
  userPresence,
  isFollowing,
  followBusy,
  onToggleFollow,
  sections,
  activeTab,
  onActiveTabChange,
  loading,
  headerAction,
}: PersonaProfileBodyProps) {
  const [bannerThumbFailed, setBannerThumbFailed] = React.useState(false);
  React.useEffect(() => {
    setBannerThumbFailed(false);
  }, [bannerUrl]);

  return (
    <div>
      {/* -- Header : banner + avatar + nom + stats -- */}
      <div className="relative overflow-hidden">
        {/* Banner — fondu vers le bas en opacité (mask-image), pas une
            couleur peinte en dur : même technique que WorldHeroCard.tsx,
            pour ne pas trancher net sur le fond réel de la page derrière
            le drawer. */}
        {bannerUrl ? (
          <div className="relative h-34 w-full [--hero-fade-start:3rem] [mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)]">
            <Image
              src={bannerThumbFailed ? bannerUrl : (supabaseThumb(bannerUrl, 920, 80, 272) ?? bannerUrl)}
              onError={() => setBannerThumbFailed(true)}
              alt=""
              fill
              sizes="768px"
              className="object-cover"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-34 bg-gradient-to-br from-card-400 to-card [--hero-fade-start:3rem] [mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)]" />
        )}
        {/* Après le contenu de la bannière dans le DOM — sinon la bannière
            (rendue après en cas contraire) le recouvrirait visuellement,
            même sans z-index explicite (ordre d'empilement par défaut). */}
        {headerAction}

        <div className="px-6 pb-4 -mt-16">
          <div className="relative flex items-start gap-4">
            {/* Avatar */}
            <div className="shrink-0">
              <AvatarWithFrame
                src={avatarUrl}
                alt={name ?? ""}
                fallback={name ? getInitials(name) : "?"}
                presenceState="invisible"
                size={128}
                frameUrl={frameUrl}
                className="outline-4 outline-background rounded-2xl"
              />
            </div>

            {/* Nom + stats */}
            <div className="pb-1 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 pb-2 mb-2">
                <p className="min-w-0 text-xl font-semibold leading-tight truncate">
                  {name ?? label ?? "—"}
                </p>
                {isFollowing !== null && (
                  <button
                    type="button"
                    onClick={onToggleFollow}
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {presenceLine && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PresenceDot state={userPresence} />
                    {presenceLine}
                  </p>
                )}
                {dialogueColor && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(dialogueColor);
                            toast.success("Couleur copiée dans le presse-papier.");
                          } catch {
                            toast.error("Impossible de copier la couleur.");
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-border-soft"
                          style={{ backgroundColor: dialogueColor }}
                        />
                        Couleur de dialogue
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{dialogueColor} — cliquer pour copier</TooltipContent>
                  </Tooltip>
                )}
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
            onValueChange={onActiveTabChange}
            className="space-y-4"
          >
            <TabBar>
              {sections.map((s) => (
                <TabBarTrigger key={s.id} value={s.id}>
                  {s.name}
                </TabBarTrigger>
              ))}
            </TabBar>

            {sections.map((s) => (
              <TabsContent
                key={s.id}
                value={s.id}
                forceMount
                className="px-6 space-y-4 data-[state=inactive]:hidden"
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
        ) : !loading ? null : (
          <div className="px-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PersonaProfileSheetTrigger({
  children,
  personaId,
  userId,
  label,
  hoverPreview = false,
  triggerClassName = "size-12",
}: {
  children: React.ReactNode;
  personaId?: string | null;
  userId?: string | null;
  label?: string | null;
  hoverPreview?: boolean;
  triggerClassName?: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const { userId: viewerId } = useCurrentUser();
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState<string | null>(label ?? null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null);
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null);
  const [dialogueColor, setDialogueColor] = React.useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = React.useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);
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
        .select("id,user_id,name,avatar_url,banner_url,dialogue_color,frame:avatar_frame_id(asset_url)")
        .eq("id", personaId!)
        .maybeSingle();

      if (error) { toast.error(error.message ?? "Impossible de charger le profil."); fetchedKeyRef.current = null; return; }
      if (!cancelled && persona) {
        const row = persona as unknown as { name?: string | null; avatar_url?: string | null; banner_url?: string | null; dialogue_color?: string | null; frame?: { asset_url?: string | null } | null };
        setName(row.name ?? label ?? null);
        setAvatarUrl(row.avatar_url ?? null);
        setBannerUrl(row.banner_url ?? null);
        setDialogueColor(row.dialogue_color ?? null);
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

  const userPresence = userId ? getUserPresence(userId) : "offline";
  const presenceLine = formatPersonaPresenceLine(userPresence, ownerPresence);

  const TriggerButton = (
    <button
      type="button"
      className={triggerClassName}
      title={label ?? "Voir le profil"}
      aria-label={label ?? "Voir le profil"}
      onPointerEnter={prefetch}
      onClick={() => setOpen(true)}
    >
      {children}
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      {hoverPreview ? (
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>{TriggerButton}</HoverCardTrigger>
          <HoverCardContent className="w-64 p-3 space-y-2">
            <p className="text-sm font-medium truncate">{label ?? "Profil"}</p>
          </HoverCardContent>
        </HoverCard>
      ) : (
        TriggerButton
      )}

      <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)] p-0">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{name ?? label ?? "Profil persona"}</DrawerTitle>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PersonaProfileBody
            name={name}
            label={label}
            avatarUrl={avatarUrl}
            bannerUrl={bannerUrl}
            frameUrl={frameUrl}
            dialogueColor={dialogueColor}
            presenceLine={presenceLine}
            userPresence={userPresence}
            isFollowing={isFollowing}
            followBusy={followBusy}
            onToggleFollow={toggleFollow}
            sections={sections}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            loading={loading}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
