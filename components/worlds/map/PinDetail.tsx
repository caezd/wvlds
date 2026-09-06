"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpenText, Check, Clock, ImagePlus, Loader2, Map as MapIcon, MessagesSquare, Pencil, Play, Trash2, Upload, UserPlus, X } from "lucide-react";

import { STORED_IMAGE_ACCEPT, isStorableImage, toWebP } from "@/lib/imageUtils";
import { supabaseThumb } from "@/lib/storage";
import { pinBannerPath } from "@/lib/storagePaths";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { MarkdownContent } from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { updateMapPin, type MapPin as MapPinType, type MapPinLink, type PlacedPersona, type WorldMapData } from "@/app/actions/worldMap";
import { StoredImage } from "@/components/ui/stored-image";
import { TimelineDateFields } from "@/components/worlds/timeline/TimelineDateFields";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import type { MapRegion } from "@/app/actions/worldMap";

import { cn } from "@/lib/utils";
import { PinVisualDialog } from "./PinVisualDialog";
import { PinLinkGraph } from "./PinLinkGraph";
import type { MapScale } from "./scale";
import type { PinRoom, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

// Panneau flottant (position: fixed), ancré sur l'épingle et non sur le clic :
// `WorldMap` le suit pendant les déplacements de la carte.
/** Poids maximal d'une bannière de lieu, en mégaoctets — une illustration,
 *  pas une carte : `toWebP` la ramène à 1200 px. */
const MAX_PIN_BANNER_MB = 5;

/**
 * Une carte d'information : un titre discret, et ce qu'il annonce.
 *
 * Les sections d'un lieu s'enchaînaient sans limite visible — on lisait une
 * suite de paragraphes, pas des choses distinctes. Le cadre dit où l'une
 * s'arrête et où la suivante commence.
 */
function Bloc({ titre, action, children }: {
  titre: string;
  /** Ce que la section permet de faire — posé à droite de son nom. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-border-soft bg-secondary/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span aria-hidden className="h-1 w-1 rounded-full bg-muted-foreground/60" />
          {titre}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Une étiquette de repère : la carte du lieu, la région qui l'entoure. */
function Repere({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1 rounded border border-border-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function PinDetail({
  pin,
  wikiPages,
  rooms,
  maps,
  timelineConfig = null,
  ownMap = null,
  region = null,
  personasHere = [],
  links = [],
  pinsById,
  aspect = 1,
  scale = null,
  onOpenPin,
  onPlacePersona,
  onRemovePersona,
  pickerVariant = "dialog",
  isEditMode,
  canPost = false,
  worldId,
  onOpenMap,
  onUpdated,
  onDelete,
}: {
  pin: MapPinType;
  /** Le panneau suit son épingle : `WorldMap` écrit sa position pendant les
   *  gestes, sans repasser par un rendu React. */
  /** Pages du wiki du monde, chargées une seule fois par `WorldMap`. */
  wikiPages: WikiPageOption[];
  /** Salons rattachés à CE lieu — le filtrage est fait par `WorldMap`. */
  rooms: PinRoom[];
  /** Cartes du monde, pour choisir celle que ce lieu ouvre. */
  maps: WorldMapData[];
  /** La chronologie du monde, quand il en a une : les lieux prennent des dates. */
  timelineConfig?: WorldTimelineConfig | null;
  /** La carte à laquelle ce lieu appartient. */
  ownMap?: WorldMapData | null;
  /** La région qui le contient, si un polygone se referme autour de lui. */
  region?: MapRegion | null;
  /** Les personas posés ici — voir migration 154. */
  personasHere?: PlacedPersona[];
  /** Les liens qui touchent ce lieu — voir migration 166. */
  links?: MapPinLink[];
  /** Les épingles de la carte, par identifiant : de quoi nommer les voisins. */
  pinsById?: Map<string, MapPinType>;
  /** Hauteur / largeur de la carte, pour que les distances soient justes. */
  aspect?: number;
  scale?: MapScale | null;
  /** Ouvre un lieu voisin depuis le graphique. */
  onOpenPin?: (pin: MapPinType) => void;
  /** Pose un de mes personas ici. Absent : la fiche n'offre pas ce geste. */
  onPlacePersona?: (personaId: string) => void;
  /** Fait partir d'ici un de mes personas. */
  onRemovePersona?: (personaId: string) => void;
  /** Un dialogue s'imbrique mal dans le tiroir mobile, qui en accueille un. */
  pickerVariant?: "dialog" | "drawer";
  isEditMode: boolean;
  /** Peut ouvrir un salon : montre « Jouer ici ». */
  canPost?: boolean;
  worldId: string;
  onUpdated: (updated: MapPinType) => void;
  onDelete: () => void;
  /** Bascule sur la carte que ce lieu ouvre. */
  onOpenMap: (mapId: string) => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  // On ne fait partir que les siens : la RLS le dit aussi, mais après coup.
  const { userId } = useCurrentUser();
  const supabase = createClient();

  const [editing, setEditing] = React.useState(false);
  const [existsFrom, setExistsFrom] = React.useState<WorldTimelineDate | null>(pin.exists_from ?? null);
  const [existsUntil, setExistsUntil] = React.useState<WorldTimelineDate | null>(pin.exists_until ?? null);
  const router = useRouter();

  /**
   * La page du wiki que ce lieu raconte.
   *
   * La carte est l'index géographique du monde et le wiki en est le texte ;
   * rien ne les reliait. Les titres des pages viennent de `WorldMap`, qui les
   * charge une fois pour toutes : chaque panneau les rechargeait pour lui-même,
   * soit une requête par ouverture d'épingle pour un résultat identique.
   */
  const [wikiPageId, setWikiPageId] = React.useState<string | null>(pin.wiki_page_id ?? null);
  const linkedPage = wikiPages.find(p => p.id === (pin.wiki_page_id ?? null)) ?? null;

  /**
   * La carte que ce lieu ouvre — l'épingle « Capitale » du continent mène au
   * plan de la capitale.
   *
   * Sa propre carte est écartée du choix : le lien y serait un bouton qui ne va
   * nulle part. La base l'interdit d'ailleurs (migration 153).
   */
  const [targetMapId, setTargetMapId] = React.useState<string | null>(pin.target_map_id ?? null);
  const cartesChoisissables = maps.filter(m => m.id !== pin.map_id);
  const linkedMap = maps.find(m => m.id === (pin.target_map_id ?? null)) ?? null;
  const [title, setTitle] = React.useState(pin.title);
  const [description, setDescription] = React.useState(pin.description ?? "");
  const [uploadingBanner, setUploadingBanner] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [visualDialogOpen, setVisualDialogOpen] = React.useState(false);
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  // Sync when pin changes from outside (realtime)
  React.useEffect(() => {
    if (!editing) {
      setTitle(pin.title);
      setDescription(pin.description ?? "");
      setWikiPageId(pin.wiki_page_id ?? null);
      setTargetMapId(pin.target_map_id ?? null);
      setExistsFrom(pin.exists_from ?? null);
      setExistsUntil(pin.exists_until ?? null);
    }
  }, [pin, editing]);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const champs = {
        title: title.trim(),
        description: description || null,
        wiki_page_id: wikiPageId,
        target_map_id: targetMapId,
        exists_from: existsFrom,
        exists_until: existsUntil,
      };
      await updateMapPin(pin.id, champs);
      onUpdated({ ...pin, ...champs });
      setEditing(false);
      toast.success(t("pinUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleBannerUpload(file: File) {
    if (!isStorableImage(file)) {
      toast.error(t("imageFormats"));
      return;
    }
    if (file.size > MAX_PIN_BANNER_MB * 1024 * 1024) {
      toast.error(t("fileTooLarge", { max: MAX_PIN_BANNER_MB }));
      return;
    }
    setUploadingBanner(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(ERR_NON_AUTHENTIFIE);

      const converted = await toWebP(file, 1200);
      // Rangée sous le préfixe du lieu : supprimer le lieu, c'est vider ce
      // dossier. Le nom du fichier est tiré au sort — ces espaces sont en
      // lecture publique, et un horodatage se devine (cf. `lib/storagePaths.ts`).
      const path = pinBannerPath(worldId, pin.id, converted.type);

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { contentType: converted.type });
      if (upErr) throw upErr;

      const banner_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;

      await updateMapPin(pin.id, { banner_url });
      onUpdated({ ...pin, banner_url });
      toast.success(t("bannerUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingBanner(false);
    }
  }

  const bannerSrc = supabaseThumb(pin.banner_url, 680, 80) ?? pin.banner_url ?? undefined;

  return (
    <>
      {isEditMode && (
        // Le div arrête la propagation vers le onClick extérieur de WorldMap
        // (les events des portals Radix remontent quand même via l'arbre React)
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <PinVisualDialog
            pin={pin}
            open={visualDialogOpen}
            onOpenChange={setVisualDialogOpen}
            onUpdated={onUpdated}
          />
        </div>
      )}

      {/* La fiche remplit la colonne qui l'accueille : elle n'a plus ni
          position à calculer, ni hauteur à tenir, ni flèche à faire pointer.

          Seul le corps défile : les commandes d'auteur tiennent au pied de la
          colonne, où elles restent atteignables quel que soit ce qu'on lit. */}
      <div data-pin-detail className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ── Bannière ─────────────────────────────────── */}
          <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
            {bannerSrc ? (
              <Image
                src={bannerSrc}
                alt=""
                fill
                sizes="320px"
                className="object-cover"
              />
            ) : isEditMode ? (
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {uploadingBanner ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs">{t("addBanner")}</span>
                  </>
                )}
              </button>
            ) : null}

            {/* Overlay bannière en mode edit si image déjà présente */}
            {bannerSrc && isEditMode && (
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 hover:bg-black/40 hover:opacity-100 focus-within:opacity-100 transition-all"
              >
                {uploadingBanner ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Upload className="h-5 w-5 text-white" />
                )}
              </button>
            )}

            {/* Le titre, posé sur la bannière — c'est la même chose qu'on
                regarde. Le dégradé le décolle de l'image : un nom clair sur un
                ciel clair ne se lirait pas. `pointer-events-none` pour que le
                clic traverse jusqu'au bouton d'import, dessous.

                En écriture il repasse dans le formulaire : un champ de saisie
                par-dessus une photo se lit mal, et c'est là qu'on le corrige. */}
            {!editing && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-8">
                <h3 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                  {pin.title}
                </h3>
                {/* Lancer une scène ici, à côté du nom du lieu : c'est l'action
                    qu'on vient chercher, elle n'a pas à se trouver plus bas que
                    ce qui la nomme. Le bandeau ne prend pas le pointeur — le
                    bouton d'import de bannière est dessous —, ce bouton-ci si. */}
                {canPost && (
                  <button
                    type="button"
                    onClick={() => router.push(`/w/${worldId}?play=${pin.id}`)}
                    className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-md border border-white/30 bg-white/15 px-2 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Play className="h-3.5 w-3.5" /> {t("playHere")}
                  </button>
                )}
              </div>
            )}

            <input
              ref={bannerInputRef}
              type="file"
              accept={STORED_IMAGE_ACCEPT}
              // Déclenché par le bouton visible, jamais atteint au clavier :
              // le laisser dans l'arbre d'accessibilité imposerait un libellé
              // pour un champ que personne ne rencontre.
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleBannerUpload(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* ── Contenu ──────────────────────────────────── */}
          <div className="p-4 flex flex-col gap-3">
            {/* Où se trouve ce lieu : sa carte, et la région qui l'entoure.
                La carte le savait déjà — un polygone se referme autour de
                l'épingle — mais ne le disait nulle part. */}
            {!editing && (ownMap || region) && (
              <div className="flex flex-wrap items-center gap-1">
                {ownMap && (
                  <Repere>
                    <MapIcon aria-hidden className="h-3 w-3 shrink-0" />
                    <span className="truncate">{ownMap.label?.trim() || t("title")}</span>
                  </Repere>
                )}
                {region && (
                  <Repere>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: region.color }} />
                    <span className="truncate">{region.label}</span>
                  </Repere>
                )}
              </div>
            )}

            {/* Le titre n'est ici qu'en écriture — ailleurs il vit sur la bannière. */}
            {editing && (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-base font-semibold outline-none focus:ring-2 focus:ring-primary"
                placeholder={t("locationName")}
              />
            )}

            {/* La description vient d'abord : ce que le lieu EST se lit avant ce
                vers quoi il mène. */}
            <div className="max-h-48 overflow-y-auto">
              {editing ? (
                <ParagraphBlockEditor
                  value={description}
                  onChange={setDescription}
                  placeholder={t("descPlaceholder")}
                  submitOnEnter={false}
                  wrapperClassName="max-h-32"
                />
              ) : pin.description ? (
                // `MarkdownContent` plutôt que `MarkdownRenderer` : celui-ci pose
                // son propre `prose-sm sm:prose-base`, qui remontait le texte à
                // 16 px dès l'écran large — trop gros pour une carte de 340 px, et
                // hors d'atteinte d'une classe posée par-dessus.
                <div
                  className={cn(
                    "prose prose-sm dark:prose-invert max-w-none text-muted-foreground",
                    "prose-p:text-xs prose-li:text-xs prose-headings:text-sm",
                    "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                  )}
                >
                  <MarkdownContent content={pin.description} />
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  {isEditMode ? t("addDescriptionHint") : t("noDescription")}
                </p>
              )}
            </div>

            {/* Page du wiki : à choisir en écriture, à ouvrir en lecture. */}
            {editing ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("wikiPage")}
                <select
                  value={wikiPageId ?? ""}
                  onChange={e => setWikiPageId(e.target.value || null)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{t("noWikiPage")}</option>
                  {wikiPages.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
            ) : linkedPage ? (
              // L'icône dit déjà ce qu'on ouvre : la phrase ne restait que
              // pour ce que le livre montre. Elle demeure en nom accessible —
              // « Arkham » seul ne dit rien à qui écoute la page.
              <button
                type="button"
                aria-label={`${t("openWikiPage")} : ${linkedPage.title}`}
                title={t("openWikiPage")}
                onClick={() => router.push(`/w/${worldId}?view=wiki&page=${encodeURIComponent(linkedPage.slug)}`)}
                className="flex w-fit items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <BookOpenText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{linkedPage.title}</span>
              </button>
            ) : null}

            {/* Carte liée : à choisir en écriture, à ouvrir en lecture. */}
            {editing ? (
              cartesChoisissables.length > 0 && (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t("targetMap")}
                  <select
                    value={targetMapId ?? ""}
                    onChange={e => setTargetMapId(e.target.value || null)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">{t("noTargetMap")}</option>
                    {cartesChoisissables.map(m => (
                      <option key={m.id} value={m.id}>{m.label?.trim() || t("title")}</option>
                    ))}
                  </select>
                </label>
              )
            ) : linkedMap ? (
              <button
                type="button"
                aria-label={`${t("openTargetMap")} : ${linkedMap.label?.trim() || t("title")}`}
                title={t("openTargetMap")}
                onClick={() => onOpenMap(linkedMap.id)}
                className="flex w-fit items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <MapIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{linkedMap.label?.trim() || t("title")}</span>
              </button>
            ) : null}

            {/* Depuis quand, jusqu'à quand. En édition, deux dates ; en lecture,
                une ligne — ou rien, pour un lieu de toujours. */}
            {timelineConfig && editing && (
              <div className="flex flex-col gap-1.5">
                <TimelineDateFields label={t("existsFrom")} value={existsFrom} onChange={setExistsFrom} config={timelineConfig} />
                <TimelineDateFields label={t("existsUntil")} value={existsUntil} onChange={setExistsUntil} config={timelineConfig} />
              </div>
            )}
            {timelineConfig && !editing && (pin.exists_from || pin.exists_until) && (
              <Bloc titre={t("placeEra")}>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {pin.exists_from && pin.exists_until
                    ? t("existsBetween", { from: formatTimelineLabel(timelineConfig, pin.exists_from), until: formatTimelineLabel(timelineConfig, pin.exists_until) })
                    : pin.exists_from
                      ? t("existsSince", { from: formatTimelineLabel(timelineConfig, pin.exists_from) })
                      : t("existsTill", { until: formatTimelineLabel(timelineConfig, pin.exists_until!) })}
                </span>
              </p>
              </Bloc>
            )}

            {/* Ce que ce lieu rejoint. La carte montre le réseau entier ; ici
              on ne voit que ce qui part d'ici, et l'on y saute d'un clic. */}
          {!editing && pinsById && onOpenPin && links.length > 0 && (
            <Bloc titre={t("linkedPlaces")}>
              <PinLinkGraph
                pin={pin}
                links={links}
                pins={pinsById}
                aspect={aspect}
                scale={scale}
                onOpenPin={onOpenPin}
              />
            </Bloc>
          )}

          {/* Qui se trouve ici. La carte n'en donne que le nombre : c'est
                ici qu'on lit les noms.

                Le bloc reste debout pour un lieu désert dès lors qu'on peut s'y
                installer : sinon le geste n'existerait qu'aux endroits déjà
                occupés, et un lieu vide le resterait. */}
            {!editing && (personasHere.length > 0 || onPlacePersona) && (
              <Bloc
                titre={t("whoIsHere")}
                action={onPlacePersona && (
                  <PersonaPickerDialog
                    selected={null}
                    worldId={worldId}
                    variant={pickerVariant}
                    onSelect={(persona) => { if (persona) onPlacePersona(persona.id); }}
                    trigger={
                      // Taillé comme « Jouer ici » : deux gestes de même nature,
                      // qui n'ont pas à peser différemment.
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {t("settleHere")}
                      </button>
                    }
                  />
                )}
              >
                {personasHere.map(persona => (
                  <div key={persona.id} className="flex items-center gap-2 text-xs">
                    {/* `relative` : `StoredImage` se pose en `absolute inset-0`,
                        et sans ancêtre positionné ici, elle allait chercher le
                        cadre de la carte — cinq avatars étalés en plein écran. */}
                    <span
                      data-persona-avatar
                      className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-secondary"
                    >
                      {persona.avatar_url && (
                        <StoredImage url={persona.avatar_url} width={48} height={48} resize="cover" className="object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{persona.name}</span>
                    {onRemovePersona && persona.user_id === userId && (
                      <button
                        type="button"
                        aria-label={t("removeFromPlace", { name: persona.name })}
                        onClick={() => onRemovePersona(persona.id)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </Bloc>
            )}

            {/* Ce qui se joue ici. Le lien `chatrooms.map_pin_id` existait déjà :
                seul le sens carte → salons manquait. */}
            {!editing && rooms.length > 0 && (
              <Bloc titre={t("roomsAtPlace")}>
                {rooms.map(salon => (
                  <button
                    key={salon.id}
                    type="button"
                    onClick={() => router.push(`/c/${salon.id}`)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{salon.title || salon.name}</span>
                  </button>
                ))}
              </Bloc>
            )}
          </div>
        </div>

        {/* Les commandes d'auteur, au pied de la colonne. Au fil du contenu,
            elles s'éloignaient à mesure qu'un lieu se remplissait — et il
            fallait dérouler toute une fiche pour corriger son titre. */}
        {isEditMode && (
          <div
            data-pin-actions
            className="flex shrink-0 items-center gap-2 border-t border-border-soft px-4 py-3"
          >
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {tCommon("save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTitle(pin.title);
                    setDescription(pin.description ?? "");
                    setWikiPageId(pin.wiki_page_id ?? null);
                    setTargetMapId(pin.target_map_id ?? null);
                    setExistsFrom(pin.exists_from ?? null);
                    setExistsUntil(pin.exists_until ?? null);
                    setEditing(false);
                  }}
                >
                  {tCommon("cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {tCommon("edit")}
                </Button>
                {/* L'apparence de l'épingle, chassée de la bannière par le
                    titre : la pastille montre ce qu'elle vaut, et l'ouvre. */}
                <button
                  type="button"
                  aria-label={t("editPinVisual")}
                  title={t("editPinVisual")}
                  onClick={() => setVisualDialogOpen(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110"
                  style={{
                    backgroundColor: pin.color || "transparent",
                    border: pin.border_color
                      ? `2px ${pin.border_style || "solid"} ${pin.border_color}`
                      : "2px solid rgba(255,255,255,0.6)",
                  }}
                >
                  {pin.icon && (
                    <LazyLucideIcon
                      name={pin.icon}
                      className="h-3 w-3"
                      style={{ color: pin.icon_color || "#ffffff" }}
                    />
                  )}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {tCommon("delete")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
