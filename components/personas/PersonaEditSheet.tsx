// components/personas/PersonaEditSheet.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createPersonaRelation, deletePersonaRelation } from "@/app/actions/personaRelations";
import { messageErreurAction } from "@/lib/actionErrors";
import { useTranslations } from "next-intl";
import { NARRATIVE_STATUSES } from "@/lib/personaStatus";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toWebP } from "@/lib/imageUtils";
import { initials } from "@/lib/persona-display";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Eye, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { PersonaSubmitBar } from "./PersonaReviewPanel";
import { useWorldFaceclaimRule } from "@/hooks/useWorldFaceclaimRule";
import type { PersonaNarrativeStatus, PersonaReviewStatus, MaritalStatus } from "@/types/db";

import { PersonaSectionsTabs } from "./PersonaSectionsTabs";
import { PersonaProfileBody, formatPersonaPresenceLine } from "./PersonaProfileSheetTrigger";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import type { PersonaSectionWithFields } from "@/types/personas";
import { EMPTY_DRAFT, applyPatch, isDirty, noteOrphan, noteUpload, storagePathOf, type PersonaPatch } from "@/lib/personaDraft";

import {
  PersonaAvatarPicker,
  type AvatarConfigV1,
} from "./avatar/PersonaAvatarPicker";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { deletePersona } from "@/app/(protected)/p/actions";
import { toast } from "sonner";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Sélection + recadrage d'une image (fichier, presse-papiers ou lien externe),
// puis upload vers le bucket "personas" (partagé avatar + bannière).
// ---------------------------------------------------------------------------

function StorageUploadTab({
  personaId,
  supabase,
  userId,
  subfolder,
  cropAspect,
  previewSrc,
  previewClassName,
  onSaved,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  subfolder: string;
  cropAspect?: number;
  previewSrc?: string | null;
  previewClassName?: string;
  onSaved: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async (blob: Blob) => {
    if (!userId) { setError("Non connecté."); return; }
    setUploading(true);
    setError(null);
    const file = await toWebP(new File([blob], "image.png", { type: blob.type || "image/png" }));
    const path = `user-${userId}/${subfolder}/${personaId}.webp`;
    const { error: upErr } = await supabase.storage
      .from("personas")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("personas").getPublicUrl(path);
    const displayUrl = `${data.publicUrl}?t=${Date.now()}`;
    // Le fichier est là ; la fiche ne le portera qu'à l'enregistrement.
    setUploading(false);
    onSaved(displayUrl);
  }, [userId, subfolder, personaId, supabase, onSaved]);

  return (
    <div className="space-y-2">
      <ImagePickerCropField
        aspect={cropAspect}
        uploading={uploading}
        previewSrc={previewSrc}
        previewClassName={previewClassName}
        onConfirm={handleConfirm}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog bannière
// ---------------------------------------------------------------------------

/**
 * Proportions réelles d'une bannière de persona telle qu'elle s'affiche :
 * `h-34` (136px) sur toute la largeur d'un drawer plafonné à 460px — voir
 * les deux rendus (éditeur ici, lecture dans PersonaProfileSheetTrigger).
 *
 * Une seule constante pour la zone de recadrage ET les aperçus : ces trois
 * valeurs étaient dupliquées et avaient dérivé vers 744/136 (≈5.47), bien
 * plus large que l'affichage réel (≈3.38) — `object-cover` rognait donc
 * silencieusement ~38% de la largeur choisie par l'utilisateur.
 */
const BANNER_WIDTH = 460;
const BANNER_HEIGHT = 136;
const BANNER_ASPECT = BANNER_WIDTH / BANNER_HEIGHT;

function BannerSheet({
  open,
  onOpenChange,
  personaId,
  supabase,
  userId,
  currentBannerUrl,
  onSaved,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  currentBannerUrl: string | null;
  onSaved: (url: string) => void;
  onRemove: () => void;
}) {
  const tPersonas = useTranslations("personas");
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <SideSheetContent className="gap-4 lg:shadow-2xl">
        <DrawerHeader>
          <DrawerTitle>{tPersonas("bannerTitle")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto space-y-4 p-6">
          <StorageUploadTab
            personaId={personaId}
            supabase={supabase}
            userId={userId}
            subfolder="banners"
            cropAspect={BANNER_ASPECT}
            previewSrc={currentBannerUrl}
            previewClassName="aspect-[460/136] w-full rounded-2xl"
            onSaved={(url) => { onSaved(url); onOpenChange(false); }}
          />
        </div>
        {currentBannerUrl && (
          <DrawerFooter className="border-t border-border-soft px-6 py-3 shrink-0 flex-row justify-start">
            <DeleteConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="inline-flex text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Supprimer la bannière
                </Button>
              }
              description={tPersonas("bannerDeleteDescription")}
              onConfirm={() => {
                // Le fichier n'est effacé qu'à l'enregistrement : tant que la
                // fiche ne l'a pas relâché, une bannière détruite laisserait
                // une image cassée sans retour possible.
                onRemove();
                onOpenChange(false);
              }}
            />
          </DrawerFooter>
        )}
      </SideSheetContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// Frame Picker
// ---------------------------------------------------------------------------

type OwnedFrame = { id: string; name: string; asset_url: string | null; preview_url: string | null };

function FramePicker({
  supabase,
  userId,
  initialFrameId,
  onFrameChange,
}: {
  supabase: ReturnType<typeof createClient>;
  userId: string | null;
  initialFrameId: string | null;
  onFrameChange?: (frameId: string | null, assetUrl: string | null) => void;
}) {
  const tPersonas = useTranslations("personas");
  const [frames, setFrames] = useState<OwnedFrame[]>([]);
  const [selected, setSelected] = useState<string | null>(initialFrameId);
  const [loaded, setLoaded] = useState(false);

  useMemo(() => {
    if (!userId) return;
    supabase
      .from("user_owned_cosmetics")
      .select("item:item_id(id, name, asset_url, preview_url)")
      .eq("user_id", userId)
      .then((res: { data: Array<{ item: unknown }> | null }) => {
        const items = ((res.data ?? []) as Array<{ item: unknown }>)
          .map((r) => r.item as unknown as OwnedFrame | null)
          .filter((f): f is OwnedFrame => !!f && !!f.asset_url);
        setFrames(items);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function selectFrame(frameId: string | null) {
    setSelected(frameId);
    const assetUrl = frameId ? (frames.find((f) => f.id === frameId)?.asset_url ?? null) : null;
    onFrameChange?.(frameId, assetUrl);
  }

  if (!loaded) return <div className="h-4 w-32 animate-pulse rounded bg-muted" />;
  if (!frames.length) return (
    <p className="text-xs text-muted-foreground">{tPersonas("noFrameOwned")}</p>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {/* Option "aucun cadre" */}
      <button
        type="button"
        onClick={() => void selectFrame(null)}
        className={cn(
          "relative h-14 w-14 rounded-xl border-2 bg-muted text-xs text-muted-foreground transition-colors",
          selected === null ? "border-primary" : "border-transparent hover:border-border",
        )}
        title={tPersonas("noFrame")}
      >
        <X className="m-auto h-5 w-5" />
        {selected === null && <Check className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />}
      </button>

      {frames.map((f) => (
        <button
          key={f.id}
          type="button"
            onClick={() => void selectFrame(f.id)}
          className={cn(
            "relative h-14 w-14 rounded-xl border-2 overflow-hidden transition-colors",
            selected === f.id ? "border-primary" : "border-transparent hover:border-border",
          )}
          title={f.name}
        >
          <Image src={f.preview_url ?? f.asset_url ?? ""} alt={f.name} unoptimized fill sizes="56px" className="object-cover" />
          {selected === f.id && <Check className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />}
        </button>
      ))}
    </div>
  );
}
// ---------------------------------------------------------------------------
// Statut marital + conjoint (persona du même monde)
// ---------------------------------------------------------------------------

const MARITAL_STATUS_VALUES: MaritalStatus[] = ["single", "in_relationship", "married", "divorced", "widowed"];

/**
 * Le statut marital, et le/la conjoint·e.
 *
 * Désigner un·e conjoint·e est une relation comme une autre depuis la
 * migration 173 : le monde a un type « en couple » et un type « marié·e »,
 * réciproques et liés au statut. En créer une vers le persona d'un autre
 * joueur envoie une demande (notification) ; l'accepter écrit le statut et le
 * conjoint sur les DEUX fiches. La rompre — retirer le conjoint, ou passer à
 * un autre statut — supprime la relation, et la base rend leur liberté aux
 * deux personas.
 *
 * Le statut seul (célibataire, veuf·ve…) reste une colonne de la fiche,
 * écrite directement : il n'engage personne d'autre.
 */
export function MaritalStatusPicker({
  personaId,
  supabase,
  worldId,
  initialStatus,
  initialSpouseId,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  worldId?: string;
  initialStatus: MaritalStatus | null;
  initialSpouseId: string | null;
}) {
  const t = useTranslations("personas.maritalStatus");
  const tPersonas = useTranslations("personas");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = useState<MaritalStatus | null>(initialStatus);
  const [spouseId, setSpouseId] = useState<string | null>(initialSpouseId);
  const [worldPersonas, setWorldPersonas] = useState<{ id: string; name: string }[]>([]);
  // Les types maritaux du monde, par statut — `null` tant qu'ils ne sont pas lus.
  const [maritalTypes, setMaritalTypes] = useState<Map<string, string> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ id: string; targetName: string } | null>(null);
  const showSpouse = status === "in_relationship" || status === "married";

  useEffect(() => {
    if (!worldId || !showSpouse || loaded) return;
    (async () => {
      const [personasRes, typesRes] = await Promise.all([
        supabase
          .from("personas")
          .select("id, name")
          .eq("world_id", worldId)
          .eq("is_template", false)
          .is("deleted_at", null)
          .neq("id", personaId)
          .order("name", { ascending: true }),
        supabase
          .from("world_relation_types")
          .select("id, marital_status")
          .eq("world_id", worldId)
          .not("marital_status", "is", null),
      ]) as [
        { data: { id: string; name: string }[] | null },
        { data: { id: string; marital_status: string }[] | null },
      ];
      const personas = personasRes.data ?? [];
      setWorldPersonas(personas);
      const types = new Map((typesRes.data ?? []).map((row) => [row.marital_status, row.id]));
      setMaritalTypes(types);

      // Une demande déjà partie de ce persona, d'un type marital.
      const typeIds = [...types.values()];
      if (typeIds.length > 0) {
        const { data: pending } = (await supabase
          .from("persona_relations")
          .select("id, to_persona_id")
          .eq("from_persona_id", personaId)
          .eq("status", "pending")
          .in("type", typeIds)
          .maybeSingle()) as { data: { id: string; to_persona_id: string } | null };
        if (pending) {
          const target = personas.find((p) => p.id === pending.to_persona_id);
          setPendingRequest({ id: pending.id, targetName: target?.name ?? "" });
        }
      }
      setLoaded(true);
    })();
  }, [worldId, showSpouse, loaded, supabase, personaId]);

  /** La relation maritale acceptée qui part de ce persona, s'il y en a une. */
  async function findSpouseRelation(): Promise<string | null> {
    if (!spouseId) return null;
    const { data } = (await supabase
      .from("persona_relations")
      .select("id")
      .eq("from_persona_id", personaId)
      .eq("to_persona_id", spouseId)
      .eq("status", "accepted")
      .maybeSingle()) as { data: { id: string } | null };
    return data?.id ?? null;
  }

  /**
   * Rompt : supprime la relation, dont la base fait suivre le miroir et les
   * deux fiches. Rend faux si la rupture a échoué — on n'écrit alors pas le
   * nouveau statut par-dessus un couple toujours debout.
   */
  async function breakUp(): Promise<boolean> {
    const relationId = await findSpouseRelation();
    if (relationId) {
      const res = await deletePersonaRelation(relationId);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
    }
    setSpouseId(null);
    return true;
  }

  async function updateStatus(next: MaritalStatus | null) {
    const previous = status;
    const clearSpouse = next !== "in_relationship" && next !== "married";
    if (clearSpouse && !(await breakUp())) return;
    setStatus(next);
    // Le déclencheur de rupture a pu poser « célibataire » ou « divorcé·e » :
    // c'est le statut choisi qui compte, on l'écrit après.
    const { error } = await supabase
      .from("personas")
      .update({ marital_status: next, ...(clearSpouse ? { spouse_persona_id: null } : {}) })
      .eq("id", personaId);
    if (error) {
      toast.error(tPersonas("saveFailed"), { description: error.message });
      setStatus(previous);
      return;
    }
    if (clearSpouse && pendingRequest) {
      const res = await deletePersonaRelation(pendingRequest.id);
      // Sans ce contrôle, la demande disparaissait de l'écran tout en
      // restant en attente côté serveur.
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return;
      }
      setPendingRequest(null);
    }
    router.refresh();
  }

  async function requestSpouse(next: string | null) {
    if (next === null) {
      if (!(await breakUp())) return;
      // La rupture a rendu le persona célibataire ou divorcé : le statut
      // affiché, lui, n'a pas été changé par le joueur — on le rétablit.
      const { error } = await supabase.from("personas").update({ marital_status: status }).eq("id", personaId);
      if (error) toast.error(tPersonas("saveFailed"), { description: error.message });
      router.refresh();
      return;
    }
    if (!status || !worldId) return;
    const typeId = maritalTypes?.get(status);
    if (!typeId) {
      toast.error(t("noMaritalType"));
      return;
    }
    const res = await createPersonaRelation({ worldId, fromPersonaId: personaId, toPersonaId: next, typeId });
    if (!res.ok) {
      toast.error(tPersonas("requestFailed"), { description: messageErreurAction(res.error, tCommon) });
      return;
    }
    const targetName = worldPersonas.find((p) => p.id === next)?.name ?? "";
    if (res.relation.status === "pending") {
      setPendingRequest({ id: res.relation.id, targetName });
    } else {
      // Acceptée d'emblée (persona à soi, ou admin) : les fiches sont déjà écrites.
      setSpouseId(next);
      router.refresh();
    }
  }

  async function cancelRequest() {
    if (!pendingRequest) return;
    const res = await deletePersonaRelation(pendingRequest.id);
    if (!res.ok) {
      toast.error(tPersonas("cancelFailed"), { description: messageErreurAction(res.error, tCommon) });
      return;
    }
    setPendingRequest(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status ?? "none"} onValueChange={(v) => void updateStatus(v === "none" ? null : (v as MaritalStatus))}>
        <SelectTrigger size="sm" className="w-auto min-w-40" aria-label={t("label")}>
          <SelectValue placeholder={t("label")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("none")}</SelectItem>
          {MARITAL_STATUS_VALUES.map((value) => (
            <SelectItem key={value} value={value}>{t(value)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showSpouse && worldId && (
        pendingRequest ? (
          <div className="flex items-center gap-2 rounded-full border border-border-soft px-3 py-1.5 text-xs text-muted-foreground">
            <span>{t("pendingRequest", { name: pendingRequest.targetName })}</span>
            <button type="button" onClick={() => void cancelRequest()} className="underline hover:text-foreground">
              {t("cancelRequest")}
            </button>
          </div>
        ) : (
          <Select value={spouseId ?? "none"} onValueChange={(v) => void requestSpouse(v === "none" ? null : v)}>
            <SelectTrigger size="sm" className="w-auto min-w-48" aria-label={t("spouseLabel")}>
              <SelectValue placeholder={t("spousePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("spouseNone")}</SelectItem>
              {worldPersonas.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statut narratif : vivant, disparu, décédé, retiré (migration 180). Comme le
// reste de la fiche, le choix attend le bouton « Enregistrer ».
// ---------------------------------------------------------------------------

export function NarrativeStatusPicker({
  initialStatus,
  onChange,
}: {
  initialStatus: PersonaNarrativeStatus;
  onChange: (status: PersonaNarrativeStatus) => void;
}) {
  const t = useTranslations("personas.narrativeStatus");
  const [status, setStatus] = useState<PersonaNarrativeStatus>(initialStatus);

  function update(next: PersonaNarrativeStatus) {
    if (next === status) return;
    setStatus(next);
    onChange(next);
  }

  return (
    <Select value={status} onValueChange={(v) => update(v as PersonaNarrativeStatus)}>
      <SelectTrigger size="sm" className="w-auto min-w-36" aria-label={t("label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NARRATIVE_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>{t(value)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------

type PersonaEditSheetProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  initialBannerUrl?: string | null;
  initialFrameId?: string | null;
  initialFrameUrl?: string | null;
  initialFaceclaim?: string | null;
  initialMaritalStatus?: MaritalStatus | null;
  initialSpousePersonaId?: string | null;
  initialNarrativeStatus?: PersonaNarrativeStatus | null;
  /** Validation de la fiche (migration 181) — la barre « Soumettre » s'en sert. */
  initialReviewStatus?: PersonaReviewStatus | null;
  openOnMount?: boolean;
  trigger?: ReactNode;
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
};

type PersonaEditorContentProps = {
  personaId: string;
  personaName: string;
  sections: PersonaSectionWithFields[];
  onSectionsChange: (sections: PersonaSectionWithFields[]) => void;
  /** Le faceclaim vient d'être modifié — la barre de validation le suit. */
  onFaceclaimSaved?: (faceclaim: string | null) => void;
  /** Porte une modification au brouillon, avec les fichiers qu'elle déplace. */
  onPatch: (patch: PersonaPatch, files?: { uploaded?: string | null; orphan?: string | null }) => void;
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  initialBannerUrl?: string | null;
  initialFrameId?: string | null;
  initialFrameUrl?: string | null;
  initialFaceclaim?: string | null;
  initialMaritalStatus?: MaritalStatus | null;
  initialSpousePersonaId?: string | null;
  initialNarrativeStatus?: PersonaNarrativeStatus | null;
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
};

// ---------------------------------------------------------------------------
// Contenu partagé éditeur
// ---------------------------------------------------------------------------

export function PersonaEditorContent({
  personaId,
  personaName,
  sections,
  onSectionsChange,
  onFaceclaimSaved,
  onPatch,
  initialAvatarUrl,
  initialAvatarConfig,
  initialBannerUrl,
  initialFrameId,
  initialFrameUrl,
  initialFaceclaim,
  initialMaritalStatus,
  initialSpousePersonaId,
  initialNarrativeStatus,
  worldId,
  restrictInventory,
  restrictSkills,
  faceclaimsEnabled,
}: PersonaEditorContentProps) {
  const tPersonas = useTranslations("personas");
  const supabase = useMemo(() => createClient(), []);
  // Le monde a le dernier mot : la prop n'est qu'un premier avis, et tous les
  // appelants ne la passent pas (la création d'un persona, par exemple).
  const faceclaimRule = useWorldFaceclaimRule(worldId);
  const faceclaimShown = faceclaimsEnabled !== false && faceclaimRule?.enabled !== false;

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl ?? null);

  const [avatarConfig, setAvatarConfig] = useState<AvatarConfigV1 | null>(initialAvatarConfig ?? null);
  const [frameUrl, setFrameUrl] = useState<string | null>(initialFrameUrl ?? null);
  const { avatar_builder } = useFeatureFlags();
  const [appearanceTab, setAppearanceTab] = useState<"avatar" | "cosmetics">("avatar");
  const [avatarSubTab, setAvatarSubTab] = useState<"builder" | "upload">(avatar_builder ? "builder" : "upload");
  // L'id sert aux envois d'images (préfixe `user-{id}/…` du bucket personas).
  // Pris dans le contexte plutôt que par `auth.getUser()` : cet appel passait
  // par le verrou de session de supabase-js (navigator.locks), qu'un autre
  // onglet peut retenir sous Firefox — l'envoi n'en partait alors jamais.
  const { userId } = useCurrentUser();
  const [previewMode, setPreviewMode] = useState(false);
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const [dialogueColor, setDialogueColor] = useState<string | null>(null);
  const [ownerPresence, setOwnerPresence] = useState<{
    last_seen_at: string | null;
    appear_offline: boolean;
  } | null>(null);
  const { getUserPresence } = useGlobalPresence();
  const avatarFallback = useMemo(() => initials(personaName), [personaName]);

  // Charge à la demande (au premier passage en aperçu) ce que l'éditeur ne
  // tient pas déjà localement — couleur de dialogue et présence du
  // propriétaire — pour que PersonaProfileBody rende exactement la même
  // chose que la fiche vue depuis une chatroom (PersonaProfileSheetTrigger).
  const previewFetchedRef = useRef(false);
  useEffect(() => {
    if (!previewMode || previewFetchedRef.current) return;
    previewFetchedRef.current = true;
    (async () => {
      const { data: persona } = await supabase
        .from("personas")
        .select("dialogue_color")
        .eq("id", personaId)
        .maybeSingle();
      setDialogueColor((persona as { dialogue_color?: string | null } | null)?.dialogue_color ?? null);

      if (!userId) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("last_seen_at, appear_offline")
        .eq("id", userId)
        .maybeSingle();
      if (profile) {
        const row = profile as { last_seen_at?: string | null; appear_offline?: boolean | null };
        setOwnerPresence({ last_seen_at: row.last_seen_at ?? null, appear_offline: !!row.appear_offline });
      }
    })();
  }, [previewMode, personaId, userId, supabase]);

  const previewUserPresence = userId ? getUserPresence(userId) : "offline";
  const previewPresenceLine = formatPersonaPresenceLine(previewUserPresence, ownerPresence);

  // Bascule édition / aperçu — laisse la sheet d'édition et affiche
  // exactement le rendu de la fiche publique (PersonaProfileBody, le même
  // composant que PersonaProfileSheetTrigger utilise pour la fiche ouverte
  // depuis une chatroom), sans dupliquer son moteur de rendu. Toujours
  // visible (superposé au coin de la bannière), pas seulement au survol.
  const previewToggle = (
    <button
      type="button"
      onClick={() => setPreviewMode((v) => !v)}
      className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white"
    >
      {previewMode ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {previewMode ? "Éditer" : "Aperçu"}
    </button>
  );

  return (
    <>
      {previewMode ? (
        <PersonaProfileBody
          name={personaName}
          label={personaName}
          avatarUrl={avatarUrl}
          bannerUrl={bannerUrl}
          frameUrl={frameUrl}
          dialogueColor={dialogueColor}
          presenceLine={previewPresenceLine}
          userPresence={previewUserPresence}
          isFollowing={null}
          followBusy={false}
          onToggleFollow={() => {}}
          sections={sections}
          activeTab={previewTab}
          onActiveTabChange={setPreviewTab}
          loading={false}
          headerAction={previewToggle}
        />
      ) : (
        <>
        {/* Header — même structure que le profil en lecture */}
        <div className="relative">
          {/* Bannière cliquable */}
          <button
            type="button"
            onClick={() => setBannerDialogOpen(true)}
            className="group relative h-34 w-full block overflow-hidden focus-visible:outline-none"
            aria-label={bannerUrl ? tPersonas("editBanner") : tPersonas("addBanner")}
            title={bannerUrl ? tPersonas("editBanner") : tPersonas("addBanner")}
          >
            {bannerUrl ? (
              <StoredImage
                url={bannerUrl}
                width={920}
                height={272}
                className="object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-muted/60 to-muted" />
            )}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition bg-black/30 grid place-items-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white">
                <Pencil className="h-3.5 w-3.5" />
                {bannerUrl ? tPersonas("editBanner") : tPersonas("addBanner")}
              </span>
            </div>
          </button>
          {previewToggle}

          <div className="px-6 pb-4 -mt-16">
            <div className="relative flex items-start gap-4">
              {/* Avatar cliquable */}
              <button
                type="button"
                onClick={() => setAvatarDialogOpen(true)}
                // `outline` plutôt que `border` : même technique que
                // AvatarWithFrame (utilisé par l'aperçu et la fiche
                // publique) — un `border` mange sur la boîte de 128px (image
                // réduite à 120px, recadrée différemment), alors qu'un
                // `outline` se dessine par-dessus sans réduire l'image.
                className="group relative h-32 w-32 rounded-2xl outline-4 outline-background bg-muted overflow-hidden shadow shrink-0"
                aria-label={tPersonas("editAvatar")}
                title={tPersonas("editAvatar")}
              >
                {/* Même composant, donc mêmes tailles demandées, que l'aperçu
                    et la fiche publique (AvatarWithFrame) : c'est ce qui
                    garantit que les deux vues affichent la même image, et non
                    deux ré-encodages différents. */}
                {avatarUrl ? (
                  <StoredImage url={avatarUrl} width={avatarThumbWidth(128)} className="object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full grid place-items-center text-lg font-semibold text-muted-foreground">
                    {avatarFallback}
                  </div>
                )}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition bg-black/30 grid place-items-center">
                  <div className="text-xs text-white font-medium">Modifier</div>
                </div>
              </button>

              {/* Nom + stats (même layout que le profil) */}
              <div className="pb-1 min-w-0 flex-1">
                <div className="h-16 pb-2 mb-2 flex items-end gap-2">
                  <input
                    defaultValue={personaName}
                    onChange={(e) => onPatch({ name: e.target.value.trim() })}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    maxLength={40}
                    placeholder={tPersonas("namePlaceholder")}
                    className="min-w-0 flex-1 text-xl font-semibold leading-tight bg-transparent outline-none border-none rounded px-1 -mx-1 hover:bg-muted/60 focus:bg-muted/60 focus:underline decoration-dotted underline-offset-4 placeholder:text-muted-foreground/40 transition-colors"
                  />
                  {faceclaimShown && (
                    <div className="flex items-baseline gap-1 shrink-0 max-w-[45%]">
                      <span className="text-sm text-muted-foreground/70 shrink-0">ft.</span>
                      <input
                        defaultValue={initialFaceclaim ?? ""}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          const clean = value.length ? value : null;
                          onPatch({ faceclaim: clean });
                          onFaceclaimSaved?.(clean);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        maxLength={80}
                        placeholder="acteur/perso"
                        title={tPersonas("faceclaimHint")}
                        className="min-w-0 w-full text-sm leading-tight bg-transparent outline-none border-none rounded px-1 -mx-1 hover:bg-muted/60 focus:bg-muted/60 focus:underline decoration-dotted underline-offset-4 placeholder:text-muted-foreground/40 transition-colors"
                      />
                    </div>
                  )}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <NarrativeStatusPicker
                    initialStatus={initialNarrativeStatus ?? "alive"}
                    onChange={(narrative_status) => onPatch({ narrative_status })}
                  />
                  <MaritalStatusPicker
                    personaId={personaId}
                    supabase={supabase}
                    worldId={worldId}
                    initialStatus={initialMaritalStatus ?? null}
                    initialSpouseId={initialSpousePersonaId ?? null}
                  />
                </div>

              </div>
            </div>
          </div>
        </div>

      {/* Dialog bannière */}
      {/* Sheet bannière */}
      <BannerSheet
        open={bannerDialogOpen}
        onOpenChange={setBannerDialogOpen}
        personaId={personaId}
        supabase={supabase}
        userId={userId}
        currentBannerUrl={bannerUrl}
        onSaved={(url) => { setBannerUrl(url); onPatch({ banner_url: url }, { uploaded: url, orphan: bannerUrl }); }}
        onRemove={() => { setBannerUrl(null); onPatch({ banner_url: null }, { orphan: bannerUrl }); }}
      />

      {/* Drawer apparence (avatar + cosmétiques) */}
      <Drawer open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen} swipeDirection="right">
        <SideSheetContent className="lg:shadow-2xl overflow-hidden">
          <DrawerHeader className="px-6 pt-6 pb-0 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 rounded-xl border bg-muted overflow-hidden lg:hidden">
                {avatarUrl ? (
                  <StoredImage url={avatarUrl} width={avatarThumbWidth(56)} className="object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full grid place-items-center text-sm font-semibold text-muted-foreground">
                    {avatarFallback}
                  </div>
                )}
              </div>
              <DrawerTitle>Avatar</DrawerTitle>
            </div>
          </DrawerHeader>

          <div className="flex flex-col flex-1 overflow-hidden mt-4">
            {/* Menus alignés côte à côte (sous-menu) */}
            <div className="px-6 pb-3 border-b border-border-soft shrink-0 flex items-center gap-3 flex-wrap">
              <Tabs value={appearanceTab} onValueChange={(v) => setAppearanceTab(v as "avatar" | "cosmetics")}>
                <TabsList>
                  <TabsTrigger value="avatar">Avatar</TabsTrigger>
                  <TabsTrigger value="cosmetics">{tPersonas("tabCosmetics")}</TabsTrigger>
                </TabsList>
              </Tabs>

              {appearanceTab === "avatar" && (
                <>
                  <div className="h-6 w-px bg-border" />
                  <Tabs value={avatarSubTab} onValueChange={(v) => setAvatarSubTab(v as "builder" | "upload")}>
                    <TabsList>
                      {avatar_builder && <TabsTrigger value="builder">{tPersonas("tabBuilder")}</TabsTrigger>}
                      <TabsTrigger value="upload">Image</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </>
              )}
            </div>

            {/* Contenu */}
            {appearanceTab === "avatar" ? (
              avatarSubTab === "builder" ? (
                <div className="flex-1 overflow-auto p-6">
                  <PersonaAvatarPicker
                    personaId={personaId}
                    initialConfig={avatarConfig}
                    onSaved={(next) => {
                      const ancien = avatarUrl;
                      setAvatarUrl(next.avatarUrl ?? null);
                      setAvatarConfig(next.config ?? null);
                      onPatch(
                        { avatar_url: next.avatarUrl ?? null, avatar_config: next.config ?? null },
                        { uploaded: next.avatarUrl ?? null, orphan: ancien },
                      );
                      setAvatarDialogOpen(false);
                    }}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <StorageUploadTab
                    personaId={personaId}
                    supabase={supabase}
                    userId={userId}
                    subfolder="avatars"
                    cropAspect={1}
                    previewSrc={avatarUrl}
                    previewClassName="h-32 w-32 rounded-2xl mx-auto"
                    onSaved={(url) => {
                      setAvatarUrl(url);
                      setAvatarConfig(null);
                      onPatch({ avatar_url: url, avatar_config: null }, { uploaded: url, orphan: avatarUrl });
                      setAvatarDialogOpen(false);
                    }}
                  />
                </div>
              )
            ) : (
              <div className="flex-1 overflow-auto p-6">
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium mb-3">Cadre d&apos;avatar</p>
                    <FramePicker
                      supabase={supabase}
                      userId={userId}
                      initialFrameId={initialFrameId ?? null}
                      onFrameChange={(frameId, assetUrl) => { setFrameUrl(assetUrl); onPatch({ avatar_frame_id: frameId }); }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {(avatarUrl || avatarConfig) && (
            <DrawerFooter className="border-t border-border-soft px-6 py-3 shrink-0 flex-row justify-start">
              <DeleteConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="inline-flex text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Supprimer l&apos;avatar
                  </Button>
                }
                description={tPersonas("avatarDeleteDescription")}
                onConfirm={() => {
                  // Même précaution que pour la bannière : le fichier n'est
                  // effacé qu'une fois la fiche enregistrée sans lui.
                  setAvatarUrl(null);
                  setAvatarConfig(null);
                  onPatch({ avatar_url: null, avatar_config: null }, { orphan: avatarUrl });
                  setAvatarDialogOpen(false);
                }}
              />
            </DrawerFooter>
          )}
        </SideSheetContent>
      </Drawer>

      {/* Aperçu de la bannière actuelle dans l'espace libre à gauche (desktop only).
          Porté vers document.body pour passer au-dessus de l'obfuscateur Radix. */}
      {bannerDialogOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="hidden lg:flex fixed inset-y-0 left-0 right-[460px] z-[51] items-center justify-center p-10 pointer-events-none">
            <div className="flex w-full max-w-[520px] flex-col items-center gap-4">
              <div className="relative aspect-[460/136] w-full overflow-hidden rounded-xl bg-muted shadow-2xl">
                {bannerUrl ? (
                  <StoredImage
                    url={bannerUrl}
                    width={1040}
                    height={308}
                    className="object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-muted/60 to-muted grid place-items-center text-sm font-medium text-muted-foreground">
                    Aucune bannière
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-white/80">{tPersonas("currentBanner")}</p>
            </div>
          </div>,
          document.body,
        )}

      {/* Sections */}
      <div className="space-y-4">
        <PersonaSectionsTabs
          personaId={personaId}
          userId={userId}
          sections={sections}
          onSectionsChange={onSectionsChange}
          worldId={worldId}
          restrictInventory={restrictInventory}
          restrictSkills={restrictSkills}
        />
      </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sheet d'édition
// ---------------------------------------------------------------------------

export function PersonaEditSheet({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
  initialBannerUrl,
  initialFrameId,
  initialFrameUrl,
  initialFaceclaim,
  initialMaritalStatus,
  initialSpousePersonaId,
  initialNarrativeStatus,
  initialReviewStatus,
  openOnMount = false,
  trigger,
  worldId,
  restrictInventory,
  restrictSkills,
  faceclaimsEnabled,
}: PersonaEditSheetProps) {
  const tPersonas = useTranslations("personas");
  const router = useRouter();
  const [open, setOpen] = useState(openOnMount);
  const [deleting, setDeleting] = useState(false);
  const [sections, setSections] = useState(initialSections);
  // Le faceclaim est saisi dans la fiche et pèse sur la validation quand le
  // monde l'exige : la barre le lit ici plutôt que de le relire en base.
  const [faceclaim, setFaceclaim] = useState<string | null>(initialFaceclaim ?? null);
  const tCommon = useTranslations("common");
  // Rien ne part en base avant « Enregistrer » : les modifications s'empilent
  // ici, avec les fichiers qu'elles laissent derrière elles.
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const initialValues = useMemo<PersonaPatch>(() => ({
    name: personaName,
    faceclaim: initialFaceclaim ?? null,
    avatar_url: initialAvatarUrl ?? null,
    avatar_config: initialAvatarConfig ?? null,
    banner_url: initialBannerUrl ?? null,
    avatar_frame_id: initialFrameId ?? null,
    narrative_status: initialNarrativeStatus ?? "alive",
  }), [personaName, initialFaceclaim, initialAvatarUrl, initialAvatarConfig, initialBannerUrl, initialFrameId, initialNarrativeStatus]);
  const dirty = isDirty(draft);

  function patchDraft(patch: PersonaPatch, files?: { uploaded?: string | null; orphan?: string | null }) {
    setDraft((prev) => {
      let next = applyPatch(prev, patch, initialValues);
      if (files?.uploaded) next = noteUpload(next, files.uploaded);
      // Un fichier de la fiche, remplacé ou retiré : effacé une fois la
      // nouvelle version enregistrée, pas avant.
      if (files?.orphan && !next.uploaded.includes(storagePathOf(files.orphan) ?? "")) {
        next = noteOrphan(next, files.orphan);
      }
      return next;
    });
  }

  /** Écrit la fiche, puis efface les fichiers qu'elle ne porte plus. */
  async function save() {
    if (!dirty || saving) return true;
    setSaving(true);
    const { error } = await supabase.from(TABLE.PERSONAS).update(draft.patch).eq("id", personaId);
    if (error) {
      setSaving(false);
      toast.error(tPersonas("saveFailed"), { description: error.message });
      return false;
    }
    if (draft.orphans.length > 0) await supabase.storage.from("personas").remove(draft.orphans);
    setDraft(EMPTY_DRAFT);
    setSaving(false);
    toast.success(tPersonas("saved"));
    router.refresh();
    return true;
  }

  /** Abandonne : les fichiers envoyés pour rien ne restent pas au stockage. */
  async function discard() {
    if (draft.uploaded.length > 0) await supabase.storage.from("personas").remove(draft.uploaded);
    setDraft(EMPTY_DRAFT);
  }

  function requestClose(next: boolean) {
    if (next || !dirty) { setOpen(next); return; }
    setConfirmClose(true);
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePersona(personaId);
    if (!result.ok) {
      toast.error(tPersonas("deleteFailed"), { description: result.error });
      setDeleting(false);
      return;
    }
    setOpen(false);
    toast.success(`${personaName} a été supprimé.`);
    router.refresh();
  }

  return (
    <>
      {trigger
        ? <span onClick={() => setOpen(true)} style={{ display: "contents" }}>{trigger}</span>
        : <button className="text-sm underline" onClick={() => setOpen(true)}>{tPersonas("editAction")}</button>
      }
      <Drawer open={open} onOpenChange={requestClose} swipeDirection="right">
        {/* Le recul visuel de ce drawer quand le drawer avatar/bannière
            imbriqué s'ouvre (assombrissement, contenu masqué) vient du
            stack natif de Drawer — voir `data-nested-drawer-open` dans
            components/ui/drawer.tsx — puisque BannerSheet et le drawer
            avatar (dans PersonaEditorContent) sont déjà rendus à
            l'intérieur de ce DrawerContent, donc réellement imbriqués. Plus
            besoin de décalage/flou manuel piloté par un état local. */}
        <SideSheetContent hideClose>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Éditer — {personaName}</DrawerTitle>
          </DrawerHeader>

          {/* Zone scrollable */}
          <div className="flex-1 overflow-y-auto">
            <PersonaEditorContent
              personaId={personaId}
              personaName={personaName}
              sections={sections}
              onSectionsChange={setSections}
              initialAvatarUrl={initialAvatarUrl}
              initialAvatarConfig={initialAvatarConfig}
              initialBannerUrl={initialBannerUrl}
              worldId={worldId}
              restrictInventory={restrictInventory}
              restrictSkills={restrictSkills}
              initialFrameId={initialFrameId}
              initialFrameUrl={initialFrameUrl}
              initialFaceclaim={initialFaceclaim}
              onFaceclaimSaved={setFaceclaim}
              onPatch={patchDraft}
              initialMaritalStatus={initialMaritalStatus}
              initialSpousePersonaId={initialSpousePersonaId}
              initialNarrativeStatus={initialNarrativeStatus}
              faceclaimsEnabled={faceclaimsEnabled}
            />
          </div>

          {/* Validation de la fiche : ce qui manque, et le bouton « Soumettre ». */}
          <PersonaSubmitBar
            personaId={personaId}
            worldId={worldId}
            sections={sections}
            faceclaim={faceclaim}
            initialReviewStatus={initialReviewStatus}
            onSectionsReload={setSections}
            className="border-t border-border-soft bg-background px-6 py-3"
          />

          {/* Footer fixe en bas */}
          <DrawerFooter className="border-t border-border-soft px-6 py-3 flex-row justify-start bg-background">
            <DeleteConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Supprimer ce personnage
                </Button>
              }
              description={`"${personaName}" sera supprimé définitivement, ainsi que son avatar, sa bannière et toutes ses images de section.`}
              onConfirm={handleDelete}
            />
            {/* Rien n'est enregistré tant qu'on ne l'a pas demandé : le bouton
                ne paraît que lorsqu'il y a quelque chose à écrire. */}
            {dirty && (
              <Button size="sm" className="ml-auto" disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {tCommon("save")}
              </Button>
            )}
          </DrawerFooter>
        </SideSheetContent>
      </Drawer>

      {/* Fermer avec des modifications en attente : on demande plutôt que de
          les perdre en silence. */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tPersonas("unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tPersonas("unsavedDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <Button
              variant="ghost"
              onClick={() => { setConfirmClose(false); void discard().then(() => setOpen(false)); }}
            >
              {tPersonas("unsavedDiscard")}
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmClose(false);
                void save().then((ok) => { if (ok) setOpen(false); });
              }}
            >
              {tCommon("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
