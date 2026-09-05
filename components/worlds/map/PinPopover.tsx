"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpenText, Check, Clock, ImagePlus, Loader2, LogOut, Map as MapIcon, MessagesSquare, Pencil, Play, Trash2, Upload } from "lucide-react";

import { toWebP } from "@/lib/imageUtils";
import { supabaseThumb } from "@/lib/storage";
import { pinBannerPath } from "@/lib/storagePaths";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { MarkdownContent } from "@/components/MarkdownRenderer";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import { updateMapPin, type MapPersona, type MapPin as MapPinType, type WorldMapData } from "@/app/actions/worldMap";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { TimelineDateFields } from "@/components/worlds/timeline/TimelineDateFields";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

import { cn } from "@/lib/utils";
import { FLECHE } from "./popoverPosition";
import { PinVisualDialog } from "./PinVisualDialog";
import type { PinPopoverPos, PinRoom, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

// Panneau flottant (position: fixed), ancré sur l'épingle et non sur le clic :
// `WorldMap` le suit pendant les déplacements de la carte.
export function PinPopover({
  pin,
  pos,
  panelRef,
  wikiPages,
  rooms,
  maps,
  personasHere,
  myPersonas,
  timelineConfig = null,
  isEditMode,
  canPost = false,
  worldId,
  onOpenMap,
  onPlacePersona,
  onUpdated,
  onDelete,
}: {
  pin: MapPinType;
  pos: PinPopoverPos;
  /** Le panneau suit son épingle : `WorldMap` écrit sa position pendant les
   *  gestes, sans repasser par un rendu React. */
  panelRef?: React.RefObject<HTMLDivElement | null>;
  /** Pages du wiki du monde, chargées une seule fois par `WorldMap`. */
  wikiPages: WikiPageOption[];
  /** Salons rattachés à CE lieu — le filtrage est fait par `WorldMap`. */
  rooms: PinRoom[];
  /** Cartes du monde, pour choisir celle que ce lieu ouvre. */
  maps: WorldMapData[];
  /** Les personas qui se trouvent ici — le filtrage est fait par `WorldMap`. */
  personasHere: MapPersona[];
  /** Mes personas de ce monde : ceux que je peux poser ici, ou faire partir. */
  myPersonas: MapPersona[];
  /** La chronologie du monde, quand il en a une : les lieux prennent des dates. */
  timelineConfig?: WorldTimelineConfig | null;
  isEditMode: boolean;
  /** Peut ouvrir un salon : montre « Jouer ici ». */
  canPost?: boolean;
  worldId: string;
  onUpdated: (updated: MapPinType) => void;
  onDelete: () => void;
  /** Bascule sur la carte que ce lieu ouvre. */
  onOpenMap: (mapId: string) => void;
  /** Pose un persona ici, ou l'en fait partir avec `null`. */
  onPlacePersona: (personaId: string, pinId: string | null) => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
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
    if (!file.type.startsWith("image/")) {
      toast.error(t("imagesOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("fileTooLarge5"));
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

      <div
        ref={panelRef}
        // Même calcul que `largeurPanneau` : 340 px déborderaient d'un
        // téléphone étroit, et le placement compte sur cette largeur-là.
        className="fixed z-50 w-[min(340px,calc(100vw-24px))]"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Flèche vers l'épingle.
            Posée DERRIÈRE la carte (`-z-10`) : seule sa moitié saillante se
            voit, l'autre disparaît sous le fond opaque du panneau, et les deux
            bordures visibles prolongent celle de la carte sans la barrer.
            `data-placement` plutôt qu'une classe calculée : `paint()` la fait
            basculer pendant les gestes, sans repasser par un rendu React. */}
        <span
          aria-hidden
          data-pin-caret
          data-placement={pos.placement}
          style={{ left: pos.arrowLeft - FLECHE / 2 }}
          className={cn(
            "absolute -z-10 h-3 w-3 rotate-45 border-border bg-background",
            "data-[placement=above]:-bottom-1.5 data-[placement=above]:border-r data-[placement=above]:border-b",
            "data-[placement=below]:-top-1.5 data-[placement=below]:border-l data-[placement=below]:border-t",
          )}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* ── Bannière ─────────────────────────────────── */}
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
          {bannerSrc ? (
            <Image
              src={bannerSrc}
              alt=""
              fill
              sizes="340px"
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
            accept="image/*"
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
            <button
              type="button"
              onClick={() => router.push(`/w/${worldId}?view=wiki&page=${encodeURIComponent(linkedPage.slug)}`)}
              className="flex w-fit items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <BookOpenText className="h-3.5 w-3.5" /> {t("openWikiPage")} : {linkedPage.title}
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
              onClick={() => onOpenMap(linkedMap.id)}
              className="flex w-fit items-center gap-1.5 rounded-md border border-border-soft px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MapIcon className="h-3.5 w-3.5" /> {t("openTargetMap")} : {linkedMap.label?.trim() || t("title")}
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
          )}

          {/* Qui est là — et de quoi y venir. Les miens ont un bouton pour
              repartir ; les autres ne se déplacent que par leur propriétaire. */}
          {!editing && (personasHere.length > 0 || myPersonas.some(p => p.map_pin_id !== pin.id)) && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("whoIsHere")}
              </p>
              {personasHere.map(persona => {
                const mien = myPersonas.some(p => p.id === persona.id);
                return (
                  <div key={persona.id} className="flex items-center gap-2 px-1 text-xs">
                    <AvatarWithFrame src={persona.avatar_url} alt={persona.name} fallback={persona.name} size={22} frameUrl={persona.frame?.asset_url} />
                    <span className="min-w-0 flex-1 truncate">{persona.name}</span>
                    {mien && (
                      <button
                        type="button"
                        aria-label={t("leavePlace")}
                        title={t("leavePlace")}
                        onClick={() => onPlacePersona(persona.id, null)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {myPersonas.some(p => p.map_pin_id !== pin.id) && (
                <select
                  value=""
                  aria-label={t("placePersona")}
                  onChange={e => { if (e.target.value) onPlacePersona(e.target.value, pin.id); }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{t("placePersona")}</option>
                  {myPersonas.filter(p => p.map_pin_id !== pin.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Ce qui se joue ici. Le lien `chatrooms.map_pin_id` existait déjà :
              seul le sens carte → salons manquait. */}
          {!editing && rooms.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("roomsAtPlace")}
              </p>
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
            </div>
          )}

          {/* Actions */}
          {isEditMode && (
            <div className="flex items-center gap-2 pt-1 border-t border-border-soft">
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
        </div>
      </div>
    </>
  );
}
