"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { PersonaTimelineView } from "@/components/personas/PersonaTimelineView";
import { createClient } from "@/lib/supabase/client";
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Persona } from "@/types/db";
import type { PersonaSection, PersonaSectionField, PersonaSectionWithFields, PersonaFieldData, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";
import { ImageGridView } from "@/components/personas/ImageGridView";
import { StoredImage } from "@/components/ui/stored-image";
import { getInitials } from "@/lib/textFormatting";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LOCK_REASON_KEYS, getUsablePersonaIds, personaLockReason, type EligibilityPersona } from "@/lib/personaEligibility";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { PersonaNpcBadge } from "@/components/personas/PersonaNpcBadge";
import { PersonaJournalSection } from "@/components/personas/PersonaJournalSection";
import { indexCatalog } from "@/lib/worldCatalog";
import { InventoryFieldView, SkillsFieldView } from "@/components/personas/fields/CatalogFieldViews";
import { PersonaRelationsSection } from "@/components/personas/PersonaRelationsSection";
import type { WorldCatalogItem } from "@/types/worlds";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

// -- Timeline collapsible -------------------------------------
// -- Read-only field renderer ---------------------------------
type FieldData = PersonaFieldData | null | undefined;

function FieldView({
  type,
  data,
  catalog,
}: {
  type: string;
  data: FieldData;
  catalog?: Map<string, WorldCatalogItem>;
}) {
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
    return <InventoryFieldView items={data?.inventoryItems ?? []} catalog={catalog} />;
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
  if (type === "skills") {
    return <SkillsFieldView items={data?.skillItems ?? []} catalog={catalog} />;
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

  // Éligibilité (plan gratuit : 5 personas les plus anciens par monde) — ne
  // concerne que le persona du viewer lui-même (cf. migration 090).
  const [usableForSelf, setUsableForSelf] = useState(true);
  const { can } = useWorldMembership();
  const canPlayNpc = can("npc.play");
  const [lockReason, setLockReason] = useState<keyof typeof LOCK_REASON_KEYS>("quota");
  const [sections, setSections] = useState<PersonaSectionWithFields[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [_frameUrl, setFrameUrl] = useState<string | null>(null);
  /**
   * Le catalogue du monde, pour rendre l'inventaire à jour.
   *
   * La fiche garde une copie du nom et de l'icône prise à l'ajout ; c'est le
   * catalogue qui fait foi (voir `resolveCatalogEntry`). Il reste `undefined`
   * tant qu'il n'est pas chargé, et rien n'est alors marqué comme retiré :
   * l'ignorance ne s'affiche pas comme une certitude.
   */
  const [catalog, setCatalog] = useState<Map<string, WorldCatalogItem> | undefined>(undefined);
  const [worldId, setWorldId] = useState<string | null>(null);

  const [ownerPresence, setOwnerPresence] = useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);

  useEffect(() => {
    if (!persona) {
      setSections([]);
      setActiveTab(null);
      setOwnerPresence(null);
      setBannerUrl(null);
      setFrameUrl(null);
      setUsableForSelf(true);
      setCatalog(undefined);
      setWorldId(null);
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
      let lockReasonResult: keyof typeof LOCK_REASON_KEYS = "quota";
      const worldId = (personaRow as unknown as { world_id?: string | null } | null)?.world_id ?? null;
      // Un PNJ (migration 182) se joue avec « Jouer les PNJ » ; sans, verrou.
      if (persona!.is_npc && !canPlayNpc) {
        usableForSelfResult = false;
        lockReasonResult = "npc";
      } else if ((persona!.user_id === selfId || persona!.is_npc) && worldId && selfId) {
        const { data: siblings } = await supabase
          .from("personas")
          .select("id, created_at, is_template, review_status, sheet_complete, is_npc")
          .or(`user_id.eq.${selfId},is_npc.eq.true`)
          .eq("world_id", worldId)
          .is("deleted_at", null);
        const rows = (siblings ?? []) as EligibilityPersona[];
        const usable = getUsablePersonaIds(rows, plan);
        usableForSelfResult = usable.has(persona!.id);
        lockReasonResult = personaLockReason(rows.find((p) => p.id === persona!.id) ?? { id: persona!.id, created_at: "" }, usable) ?? "quota";
      }

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

      // Le catalogue VIVANT du monde — une requête de plus, mais sans elle un
      // objet renommé ou retiré s'afficherait encore sous son ancien nom. Les
      // lignes en corbeille sont écartées en clair : un éditeur les lit
      // (migration 165), et sa fiche doit dire la même chose que les autres.
      let catalogById: Map<string, WorldCatalogItem> | undefined;
      if (worldId) {
        const { data: catalogRows } = await supabase
          .from("world_catalog_items")
          .select("id, world_id, type, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
          .eq("world_id", worldId)
          .is("deleted_at", null);
        if (catalogRows) catalogById = indexCatalog(catalogRows as unknown as WorldCatalogItem[]);
      }

      if (cancelled) return;
      setCatalog(catalogById);
      setWorldId(worldId);
      const row = personaRow as unknown as { banner_url?: string | null; frame?: { asset_url?: string | null } | null } | null;
      setBannerUrl(row?.banner_url ?? null);
      setFrameUrl(row?.frame?.asset_url ?? null);
      setUsableForSelf(usableForSelfResult);
      setLockReason(lockReasonResult);
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
  }, [persona?.id, selfId, plan, supabase, canPlayNpc]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <SideSheetContent closeClassName="z-10" width="persona">
        {persona && (
          <>
            <DrawerHeader className="sr-only">
              <DrawerTitle>{persona.name}</DrawerTitle>
              <DrawerDescription>{t("profileSheetDescription")}</DrawerDescription>
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto">
            {/* -- Bannière -- */}
            {bannerUrl ? (
              <div className="relative h-34 w-full shrink-0">
                <StoredImage
                  url={bannerUrl}
                  width={920}
                  height={272}
                  className="object-cover"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="h-34 w-full shrink-0 bg-gradient-to-r from-muted/60 to-muted" />
            )}

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
                <div className="flex items-center justify-center gap-1.5 text-lg font-semibold">
                  {persona.name}
                  <PersonaNpcBadge isNpc={persona.is_npc} />
                </div>
                {presenceLine && !persona.is_npc && (
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
                {persona.user_id === selfId && !persona.is_npc && (
                  <div className="text-xs text-muted-foreground">{t("yourPersona")}</div>
                )}
              </div>
              {onUsePersona && (
                (persona.user_id === selfId || persona.is_npc) && !usableForSelf ? (
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
                      {t(LOCK_REASON_KEYS[lockReason])}
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

            {/* -- Sections, puis les relations -- */}
            {(sections.length > 0 || worldId) && (
              <div className="flex-1">
                <Tabs
                  value={activeTab ?? sections[0]?.id ?? "__relations__"}
                  onValueChange={setActiveTab}
                >
                  <TabBar listClassName="px-5">
                      {sections.map((s) => (
                        <TabBarTrigger key={s.id} value={s.id}>
                          {s.name}
                        </TabBarTrigger>
                      ))}
                      {worldId && (
                        <TabBarTrigger value="__relations__">{t("relations.tab")}</TabBarTrigger>
                      )}
                      {worldId && (
                        <TabBarTrigger value="__journal__">{t("journal.tab")}</TabBarTrigger>
                      )}
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
                          <FieldView key={f.id} type={f.type} data={f.data} catalog={catalog} />
                        ))
                      )}
                    </TabsContent>
                  ))}
                  {worldId && (
                    <TabsContent value="__relations__" className="px-5 py-4">
                      <PersonaRelationsSection personaId={persona.id} worldId={worldId} ownerId={persona.user_id} selfId={selfId} />
                    </TabsContent>
                  )}
                  {worldId && (
                    <TabsContent value="__journal__" className="px-5 py-4">
                      <PersonaJournalSection personaId={persona.id} worldId={worldId} ownerId={persona.user_id} isNpc={!!persona.is_npc} />
                    </TabsContent>
                  )}
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
      </SideSheetContent>
    </Drawer>
  );
}
