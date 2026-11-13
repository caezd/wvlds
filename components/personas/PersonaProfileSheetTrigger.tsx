"use client";

import * as React from "react";
import { ClipboardCheck, NotebookText, Waypoints, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { PersonaTimelineView } from "@/components/personas/PersonaTimelineView";
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
import { MemberStatusBadge } from "@/components/worlds/members/WorldMemberCard";
import { PersonaStatusBadge } from "@/components/personas/PersonaStatusBadge";
import { narrativeStatusOf } from "@/lib/personaStatus";
import { reviewStatusOf } from "@/lib/personaReview";
import { PersonaSheetBadge } from "./PersonaSheetBadge";
import { PersonaNpcBadge } from "./PersonaNpcBadge";
import { PersonaReviewSection } from "./PersonaReviewPanel";
import { PersonaJournalSection } from "./PersonaJournalSection";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useWorldReviewActive } from "@/hooks/useWorldReviewActive";
import type { PersonaNarrativeStatus, PersonaReviewStatus } from "@/types/db";
import { effectiveStatus, type WorldMemberCardFields } from "@/lib/worldMembers";
import type { PersonaSection, PersonaSectionField, PersonaSectionWithFields, PersonaFieldData, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn, formatLastSeen } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";
import { InventoryFieldView, SkillsFieldView } from "@/components/personas/fields/CatalogFieldViews";
import { PersonaRelationsSection } from "@/components/personas/PersonaRelationsSection";
import { indexCatalog } from "@/lib/worldCatalog";
import type { WorldCatalogItem } from "@/types/worlds";
import { TABLE } from "@/lib/constants";
import { getInitials } from "@/lib/textFormatting";
import { useTranslations } from "next-intl";
import { StoredImage } from "@/components/ui/stored-image";
import { SectionLabel } from "@/components/ui/section-label";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";

export type FieldData = PersonaFieldData | null | undefined;

/** Rendu lecture seule d'un champ de section — partagé avec l'aperçu affiché
 *  dans la sheet d'édition (voir PersonaEditSheet.tsx, bouton « Aperçu »),
 *  pour ne pas maintenir deux moteurs de rendu de champs en parallèle. */
export function FieldView({
  type,
  data,
  catalog,
}: {
  type: string;
  data: FieldData;
  catalog?: Map<string, WorldCatalogItem>;
}) {
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
            className="flex flex-col justify-end gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            {stat.label ? (
              <SectionLabel as="span">
                {stat.label}
              </SectionLabel>
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
    return <InventoryFieldView items={data?.inventoryItems ?? []} catalog={catalog} />;
  }
  if (type === "skills") {
    return <SkillsFieldView items={data?.skillItems ?? []} catalog={catalog} />;
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
                  backgroundColor: item.color ?? DEFAULT_PLAYER_COLOR,
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
            className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium"
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
    return <PersonaTimelineView items={visible} />;
  }
  if (type === "dl") {
    const items: DlItem[] = data?.dlItems ?? [];
    const visible = items.filter((it) => it.label || it.description);
    if (!visible.length) return null;
    // Liste de définitions classique : chaque terme, puis sa description en
    // dessous. La grille à deux colonnes d'avant imposait au texte une colonne
    // dont la largeur dépendait du plus long des titres — largement trop
    // étroite dans un tiroir.
    //
    // Les paires sont enveloppées dans un <div>, ce que la spec autorise
    // explicitement à l'intérieur d'un <dl> : c'est ce qui permet d'espacer
    // les entrées entre elles sans écarter un terme de sa propre description.
    return (
      <dl className="space-y-3 text-sm">
        {visible.map((item) => (
          <div key={item.id}>
            <dt className="font-semibold">{item.label}</dt>
            <dd className="whitespace-pre-line text-muted-foreground">{item.description}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
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
  /** La couleur du groupe du persona, quand le monde l'utilise : elle borde un avatar sans cadre. */
  groupColor?: string | null;
  presenceLine: string | null;
  userPresence: "online" | "away" | "offline";
  /** Le joueur est en pause ou absent dans ce monde (cf. WorldMemberCard). */
  statusBadge?: React.ReactNode;
  isFollowing: boolean | null;
  followBusy: boolean;
  onToggleFollow: () => void;
  sections: PersonaSectionWithFields[];
  /** Catalogue du monde, indexé — l'inventaire s'y résout. Absent : la copie
   *  rangée dans la fiche fait foi, voir `resolveCatalogEntry`. */
  catalog?: Map<string, WorldCatalogItem>;
  activeTab: string | null;
  onActiveTabChange: (id: string) => void;
  loading: boolean;
  /** Des onglets de plus, après les sections de la fiche — les relations, la relecture. */
  extraTabs?: { id: string; label: string; icon: LucideIcon; content: React.ReactNode;
    /** Un point à côté de l'icône : quelque chose attend (une fiche pas encore validée). */
    dot?: boolean }[];
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
  groupColor,
  presenceLine,
  userPresence,
  statusBadge,
  isFollowing,
  followBusy,
  onToggleFollow,
  sections,
  catalog,
  activeTab,
  onActiveTabChange,
  loading,
  extraTabs = [],
  headerAction,
}: PersonaProfileBodyProps) {
  const tCommon = useTranslations("common");
  const tabs: { id: string }[] = [...sections, ...extraTabs];

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
            <StoredImage
              url={bannerUrl}
              width={920}
              height={272}
              className="object-cover"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-34 bg-gradient-to-br from-muted to-card [--hero-fade-start:3rem] [mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_var(--hero-fade-start),transparent_100%)]" />
        )}
        {/* Après le contenu de la bannière dans le DOM — sinon la bannière
            (rendue après en cas contraire) le recouvrirait visuellement,
            même sans z-index explicite (ordre d'empilement par défaut). */}
        {headerAction}

        <div className="px-6 pb-4 -mt-16">
          <div className="relative flex items-start gap-4">
            {/* Avatar — sans cadre, bordé de la couleur de son groupe (option du monde). */}
            <div
              className="shrink-0"
              style={!frameUrl && groupColor ? ({ "--group-ring": groupColor } as React.CSSProperties) : undefined}
              data-group-ring={!frameUrl && groupColor ? groupColor : undefined}
            >
              <AvatarWithFrame
                src={avatarUrl}
                alt={name ?? ""}
                fallback={name ? getInitials(name) : "?"}
                presenceState="invisible"
                size={128}
                frameUrl={frameUrl}
                // Un anneau de 2 px à la couleur du groupe, au-delà du liseré sombre
                // (`outline-4`, peint par-dessus l'ombre), et un halo de la même teinte.
                className={cn(
                  "outline-4 outline-background rounded-2xl",
                  !frameUrl && groupColor && "shadow-[0_0_0_6px_var(--group-ring),0_0_28px_color-mix(in_oklab,var(--group-ring)_45%,transparent)]",
                )}
              />
            </div>

            {/* Nom + stats */}
            <div className="pb-1 min-w-0 flex-1">
              {/* Le nom et « Suivre » sur une même ligne, centrés l'un sur l'autre. */}
              <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                <p className="min-w-0 text-xl font-semibold leading-8 truncate">
                  {name ?? label ?? "—"}
                </p>
                {isFollowing !== null && (
                  // « Suivre » ouvre un fil de notifications, bascule sans conséquence
                  // sur la fiche : `outline` ; une fois suivi, `secondary`.
                  <Button
                    type="button"
                    size="sm"
                    variant={isFollowing ? "secondary" : "outline"}
                    onClick={onToggleFollow}
                    disabled={followBusy}
                    className="shrink-0"
                  >
                    {isFollowing ? "Suivi" : "Suivre"}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {presenceLine && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PresenceDot state={userPresence} />
                    {presenceLine}
                  </p>
                )}
                {statusBadge}
                {dialogueColor && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          void copyToClipboard(
                            dialogueColor,
                            tCommon("copyDialogueColorSuccess"),
                            tCommon("copyError"),
                          )
                        }
                        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-border"
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
        {tabs.length > 0 ? (
          <Tabs
            value={activeTab ?? tabs[0].id}
            onValueChange={onActiveTabChange}
            className="space-y-4"
          >
            <TabBar>
              {sections.map((s) => (
                <TabBarTrigger key={s.id} value={s.id}>
                  {s.name}
                </TabBarTrigger>
              ))}
              {/* Relations, journal, relecture : des onglets d'icône, après un
                  filet, pour ne pas se confondre avec les sections de la fiche. */}
              {extraTabs.length > 0 && sections.length > 0 && (
                <span aria-hidden className="h-4 w-px shrink-0 self-center bg-border" />
              )}
              {extraTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabBarTrigger key={tab.id} value={tab.id} aria-label={tab.label} title={tab.label} className="flex items-center gap-1 px-1">
                    <Icon className="h-4 w-4" aria-hidden />
                    {tab.dot && <span aria-hidden data-testid={`tab-dot-${tab.id}`} className="size-1.5 rounded-full bg-muted-foreground" />}
                  </TabBarTrigger>
                );
              })}
            </TabBar>

            {sections.map((s) => (
              <TabsContent
                key={s.id}
                value={s.id}
                forceMount
                className="px-6 space-y-4 data-[state=inactive]:hidden"
              >
                {s.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">{tCommon("noContent")}</p>
                ) : (
                  s.fields.map((f) => (
                    <FieldView key={f.id} type={f.type} data={f.data} catalog={catalog} />
                  ))
                )}
              </TabsContent>
            ))}
            {extraTabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="px-6 space-y-4">
                {tab.content}
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

/**
 * Tout ce que montre la fiche d'un persona : chargé depuis la base, puis
 * assemblé en props de `PersonaProfileBody`. La fiche ouverte depuis un salon
 * ou une liste (PersonaProfileSheetTrigger) et l'aperçu de l'éditeur
 * (PersonaEditSheet) passent tous deux par ici : une modification de la fiche
 * se voit donc dans les deux, sans rien recopier. L'aperçu ne remplace que ce
 * qu'il tient en local, pas encore enregistré (nom, images, sections).
 *
 * `userId` : le joueur du persona ; à défaut, celui de la ligne chargée.
 * Rien ne se charge avant `load()` (au survol, à l'ouverture).
 */
export function usePersonaProfile({
  personaId,
  userId: ownerIdProp,
  label,
}: {
  personaId?: string | null;
  userId?: string | null;
  label?: string | null;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const { userId: viewerId } = useCurrentUser();
  const tRelations = useTranslations("personas.relations");
  const tReview = useTranslations("personas.review");
  const tJournal = useTranslations("personas.journal");
  // Relire exige `personas.review` dans le monde du persona — le contexte
  // n'est celui de ce monde que sous `/w/[id]` ou dans un de ses salons.
  const { worldId: membershipWorldId, can } = useWorldMembership();

  const [name, setName] = React.useState<string | null>(label ?? null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null);
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null);
  const [dialogueColor, setDialogueColor] = React.useState<string | null>(null);
  const [groupColor, setGroupColor] = React.useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = React.useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);
  const [narrativeStatus, setNarrativeStatus] = React.useState<PersonaNarrativeStatus>("alive");
  const [reviewStatus, setReviewStatus] = React.useState<PersonaReviewStatus>("approved");
  const [sheetComplete, setSheetComplete] = React.useState(true);
  const [isNpc, setIsNpc] = React.useState(false);
  const [ownerStatus, setOwnerStatus] = React.useState<Pick<WorldMemberCardFields, "status" | "status_until" | "status_note"> | null>(null);
  const [sections, setSections] = React.useState<PersonaSectionWithFields[]>([]);
  const [catalog, setCatalog] = React.useState<Map<string, WorldCatalogItem> | undefined>(undefined);
  const [worldId, setWorldId] = React.useState<string | null>(null);
  const [ownerId, setOwnerId] = React.useState<string | null>(ownerIdProp ?? null);
  // Le monde relit-il ses fiches (migration 184) ? Sinon ni badge de relecture ni onglet.
  const reviewActive = useWorldReviewActive(worldId) === true;
  const [activeTab, setActiveTab] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isFollowing, setIsFollowing] = React.useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = React.useState(false);

  // Évite les double-fetch : on ne charge qu'une fois par (personaId+userId)
  const fetchedKeyRef = React.useRef<string | null>(null);

  const load = React.useCallback(() => {
    if (!personaId) return;
    const key = `${personaId}:${ownerIdProp ?? ""}:${viewerId ?? ""}`;
    if (fetchedKeyRef.current === key) return; // déjà chargé
    fetchedKeyRef.current = key;

    let cancelled = false;
    let worldIdOfPersona: string | null = null;
    setLoading(true);

    async function run() {
      let userId = ownerIdProp ?? null;
      const { data: persona, error } = await supabase
        .from("personas")
        .select("id,user_id,name,avatar_url,banner_url,dialogue_color,world_id,narrative_status,review_status,sheet_complete,is_npc,frame:avatar_frame_id(asset_url)")
        .eq("id", personaId!)
        .maybeSingle();

      if (error) { toast.error(error.message ?? "Impossible de charger le profil."); fetchedKeyRef.current = null; return; }
      if (!cancelled && persona) {
        const row = persona as unknown as { user_id?: string | null; name?: string | null; avatar_url?: string | null; banner_url?: string | null; dialogue_color?: string | null; world_id?: string | null; frame?: { asset_url?: string | null } | null };
        userId = userId ?? row.user_id ?? null;
        setOwnerId(userId);
        setName(row.name ?? label ?? null);
        setAvatarUrl(row.avatar_url ?? null);
        setBannerUrl(row.banner_url ?? null);
        setDialogueColor(row.dialogue_color ?? null);
        setNarrativeStatus(narrativeStatusOf((row as { narrative_status?: unknown }).narrative_status));
        setReviewStatus(reviewStatusOf((row as { review_status?: unknown }).review_status));
        setSheetComplete((row as { sheet_complete?: boolean | null }).sheet_complete ?? true);
        setIsNpc(!!(row as { is_npc?: boolean | null }).is_npc);
        setFrameUrl(row.frame?.asset_url ?? null);
        setWorldId(row.world_id ?? null);
        worldIdOfPersona = row.world_id ?? null;

        // La couleur de son groupe, si le monde l'utilise (migration 201).
        if (row.world_id) {
          const [{ data: worldRow }, { data: assignRow }] = await Promise.all([
            supabase.from("worlds").select("persona_group_color").eq("id", row.world_id).maybeSingle(),
            supabase.from("persona_group_assignments").select("group:group_id(color)").eq("persona_id", personaId!).maybeSingle(),
          ]);
          const on = (worldRow as { persona_group_color?: boolean } | null)?.persona_group_color !== false;
          const color = (assignRow as { group?: { color?: string | null } | null } | null)?.group?.color ?? null;
          if (!cancelled) setGroupColor(on ? color : null);
        } else if (!cancelled) {
          setGroupColor(null);
        }

        // Le catalogue VIVANT du monde : sans lui, l'inventaire s'afficherait
        // sous les noms copiés dans la fiche au moment de l'ajout. Les lignes
        // en corbeille sont écartées en clair — un éditeur les lit
        // (migration 165), et sa fiche doit dire la même chose que les autres.
        if (row.world_id) {
          const { data: catalogRows } = await supabase
            .from("world_catalog_items")
            .select("id, world_id, type, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
            .eq("world_id", row.world_id)
            .is("deleted_at", null);
          if (!cancelled && catalogRows) {
            setCatalog(indexCatalog(catalogRows as unknown as WorldCatalogItem[]));
          }
        }
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
          // Le statut ne dit que la dernière connexion du joueur.
          setOwnerPresence({
            last_seen_at: row.last_seen_at ?? null,
            appear_offline: !!row.appear_offline,
          });
        }
        // Son statut de joueur dans CE monde : un persona dont le joueur est
        // en pause le dit d'emblée, avant qu'on lui écrive.
        if (worldIdOfPersona) {
          const { data: memberRow } = await supabase
            .from(TABLE.WORLD_MEMBERS)
            .select("status, status_until, status_note")
            .eq("world_id", worldIdOfPersona)
            .eq("user_id", userId)
            .maybeSingle();
          if (!cancelled) setOwnerStatus((memberRow as Pick<WorldMemberCardFields, "status" | "status_until" | "status_note"> | null) ?? null);
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

    void run();
    return () => { cancelled = true; };
  }, [personaId, ownerIdProp, viewerId, supabase, label]);

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

  const userId = ownerId;
  const userPresence = userId ? getUserPresence(userId) : "offline";
  // Un PNJ n'a pas de joueur attitré : la présence de son créateur ne dit rien.
  const presenceLine = isNpc ? null : formatPersonaPresenceLine(userPresence, ownerPresence);
  const ownerEffectiveStatus = ownerStatus ? effectiveStatus(ownerStatus) : "active";

  const bodyProps: Omit<PersonaProfileBodyProps, "headerAction"> = {
    name,
    label,
    avatarUrl,
    bannerUrl,
    frameUrl,
    dialogueColor,
    groupColor,
    presenceLine,
    userPresence,
    statusBadge:
      isNpc || narrativeStatus !== "alive" || (reviewActive && reviewStatus !== "approved") || !sheetComplete || (ownerStatus && ownerEffectiveStatus !== "active") ? (
        <>
          <PersonaNpcBadge isNpc={isNpc} />
          <PersonaStatusBadge status={narrativeStatus} />
          <PersonaSheetBadge persona={{ review_status: reviewStatus, sheet_complete: sheetComplete }} reviewActive={reviewActive} />
          {!isNpc && ownerStatus && ownerEffectiveStatus !== "active" && (
            <MemberStatusBadge status={ownerEffectiveStatus} until={ownerStatus.status_until} note={ownerStatus.status_note} />
          )}
        </>
      ) : undefined,
    isFollowing,
    followBusy,
    onToggleFollow: toggleFollow,
    sections,
    catalog,
    activeTab,
    onActiveTabChange: setActiveTab,
    loading,
    extraTabs: personaId && worldId && userId ? [
      {
        id: "__relations__",
        label: tRelations("tab"),
        icon: Waypoints,
        content: <PersonaRelationsSection personaId={personaId} worldId={worldId} ownerId={userId} selfId={viewerId ?? null} />,
      },
      {
        id: "__journal__",
        label: tJournal("tab"),
        icon: NotebookText,
        content: <PersonaJournalSection personaId={personaId} worldId={worldId} ownerId={userId} isNpc={isNpc} />,
      },
      // La relecture : le propriétaire y lit les commentaires, un
      // relecteur du monde y valide ou renvoie la fiche.
      ...((reviewActive && (viewerId === userId || (membershipWorldId === worldId && can("personas.review")))) ? [{
        id: "__review__",
        label: tReview("tab"),
        icon: ClipboardCheck,
        dot: reviewStatus !== "approved",
        content: (
          <PersonaReviewSection
            personaId={personaId}
            worldId={worldId}
            ownerId={userId}
            reviewStatus={reviewStatus}
            sheetComplete={sheetComplete}
            canReview={membershipWorldId === worldId && can("personas.review")}
            onStatusChange={setReviewStatus}
          />
        ),
      }] : []),
    ] : [],
  };

  return { load, bodyProps, name };
}

export function PersonaProfileSheetTrigger({
  children,
  personaId,
  userId,
  label,
  hoverPreview = false,
  triggerClassName = "size-12",
  openOnMount = false,
}: {
  children: React.ReactNode;
  personaId?: string | null;
  userId?: string | null;
  label?: string | null;
  hoverPreview?: boolean;
  triggerClassName?: string;
  /** Ouvre la fiche dès le montage (lien `?persona=<id>` d'une notification). */
  openOnMount?: boolean;
}) {
  const [open, setOpen] = React.useState(openOnMount);
  const { load: prefetch, bodyProps, name } = usePersonaProfile({ personaId, userId, label });

  // Prefetch dès que la sheet s'ouvre (fallback si le hover n'a pas suffi)
  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

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

      <SideSheetContent hideClose>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{name ?? label ?? "Profil persona"}</DrawerTitle>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PersonaProfileBody {...bodyProps} />
        </div>
      </SideSheetContent>
    </Drawer>
  );
}
