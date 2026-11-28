"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TimelineDatePicker } from "@/components/worlds/timeline/TimelineDatePicker";
import { ChatroomTimelineLinks } from "@/components/chatrooms/settings/ChatroomTimelineLinks";
import { clampTimelineDate } from "@/lib/worldTimeline";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Settings } from "lucide-react";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";
import { Textarea } from "@/components/ui/textarea";
import { HelpHint } from "@/components/ui/help-hint";
import { ChatroomVisibilityField } from "@/components/chatrooms/access/ChatroomVisibilityField";
import { ChatroomInviteesField } from "@/components/chatrooms/access/ChatroomInviteesField";
import {
  SYNOPSIS_MAX_LENGTH,
  fetchChatroomInvitees,
  inviteeKey,
  saveChatroomInvitees,
  visibilityHasInvitees,
  type ChatroomInvitee,
  type ChatroomVisibility,
} from "@/lib/chatroomAccess";
import { ChatroomDayPicker } from "@/components/chatrooms/day/ChatroomDayPicker";
import { DAY_DEFAULT_ICON, DAY_DEFAULT_POSITION } from "@/lib/chatroomDay";
import { RPC } from "@/lib/constants";
import { deleteChatroom } from "@/app/actions/chatrooms";

type MapPinOption = { id: string; title: string; color: string };
/** Le temps réglable d'un salon (migration 275) : nul s'il n'en a pas. */
type DaySetting = { icon: string; position: number } | null;

function memeTemps(a: DaySetting, b: DaySetting): boolean {
  return a?.icon === b?.icon && a?.position === b?.position;
}
type CategoryOption = { id: string; title: string; banner_url: string | null; icon_url: string | null };

const schema = z.object({
  title: z.string().trim().min(1, "Nom requis").max(80),
});

type FormValues = z.infer<typeof schema>;

/** Les réglages enregistrables d'une salle, sous leur forme en base. */
type Reglages = {
  title: string | null;
  timeline_date: WorldTimelineDate | null;
  map_pin_id: string | null;
  category_id: string | null;
  visibility: ChatroomVisibility;
  synopsis: string | null;
};

/** Deux listes d'invités identiques, à l'ordre près. */
function memesInvites(a: ChatroomInvitee[], b: ChatroomInvitee[]): boolean {
  if (a.length !== b.length) return false;
  const cles = new Set(a.map(inviteeKey));
  return b.every((i) => cles.has(inviteeKey(i)));
}

function reglagesDe(c: Props["chatroom"]): Reglages {
  return {
    title: c.title?.trim() || null,
    timeline_date: c.timeline_date ?? null,
    map_pin_id: c.map_pin_id ?? null,
    category_id: c.category_id ?? null,
    visibility: c.visibility ?? "open",
    synopsis: c.synopsis?.trim() || null,
  };
}

/** Ce qui a changé, prêt à écrire. */
function ecart(avant: Reglages, apres: Reglages): Partial<Reglages> {
  const patch: Partial<Reglages> = {};
  for (const cle of Object.keys(apres) as (keyof Reglages)[]) {
    if (JSON.stringify(avant[cle]) !== JSON.stringify(apres[cle])) {
      (patch as Record<string, unknown>)[cle] = apres[cle];
    }
  }
  return patch;
}

type Props = {
  canEdit?: boolean;
  chatroom: {
    id: string;
    title: string | null;
    timeline_date?: WorldTimelineDate | null;
    map_pin_id?: string | null;
    category_id?: string | null;
    visibility?: ChatroomVisibility;
    synopsis?: string | null;
    day?: DaySetting;
  };
  worldTimelineConfig?: WorldTimelineConfig | null;
  worldId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export default function ChatroomSettingsSheet({
  canEdit,
  chatroom,
  worldTimelineConfig,
  worldId,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const t = useTranslations("chatrooms");
  const tAccess = useTranslations("chatrooms.access");
  const tDay = useTranslations("chatrooms.dayStatus");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(v: boolean) {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  }
  const [deleting, setDeleting] = React.useState(false);
  const [timelineDate, setTimelineDate] = React.useState<WorldTimelineDate | null>(chatroom.timeline_date ?? null);
  const { world_map } = useFeatureFlags();
  const [mapPins, setMapPins] = React.useState<MapPinOption[]>([]);
  const [mapPinId, setMapPinId] = React.useState<string | null>(chatroom.map_pin_id ?? null);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | null>(chatroom.category_id ?? null);
  const [visibility, setVisibility] = React.useState<ChatroomVisibility>(chatroom.visibility ?? "open");
  const [synopsis, setSynopsis] = React.useState(chatroom.synopsis ?? "");
  // Les invités vivent dans leur propre table : relus à l'ouverture, comparés
  // à part, enregistrés après le salon.
  const [invitees, setInvitees] = React.useState<ChatroomInvitee[]>([]);
  const [baseInvitees, setBaseInvitees] = React.useState<ChatroomInvitee[]>([]);
  // Le temps du salon s'écrit par sa RPC (migration 275), pas dans la ligne.
  const [day, setDay] = React.useState<DaySetting>(chatroom.day ?? null);
  const [baseDay, setBaseDay] = React.useState<DaySetting>(chatroom.day ?? null);
  // Rien ne part en base avant « Enregistrer » : `base` est l'état enregistré,
  // l'écart avec les valeurs affichées dit quoi écrire — en UNE requête.
  const [base, setBase] = React.useState<Reglages>(() => reglagesDe(chatroom));
  const [saving, setSaving] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: chatroom.title ?? "",
    },
  });

  React.useEffect(() => {
    if (open) {
      setBase(reglagesDe(chatroom));
      form.reset({ title: chatroom.title ?? "" });
      setTimelineDate(chatroom.timeline_date ?? null);
      setMapPinId(chatroom.map_pin_id ?? null);
      setCategoryId(chatroom.category_id ?? null);
      setVisibility(chatroom.visibility ?? "open");
      setSynopsis(chatroom.synopsis ?? "");
      setInvitees([]);
      setBaseInvitees([]);
      setDay(chatroom.day ?? null);
      setBaseDay(chatroom.day ?? null);
      void fetchChatroomInvitees(supabase, chatroom.id).then(
        (rows) => { setInvitees(rows); setBaseInvitees(rows); },
        (e: unknown) => console.error("[ChatroomSettingsSheet] invités", e),
      );
      if (world_map && worldId) {
        void supabase
          .from("world_map_pins")
          .select("id, title, color")
          .eq("world_id", worldId)
          .order("sort_index")
          .then(({ data }: { data: MapPinOption[] | null }) => setMapPins(data ?? []));
      }
      if (worldId) {
        void (async () => {
          const { data, error } = await supabase
            .from("chatroom_categories")
            .select("id, title, banner_url, icon_url")
            .eq("world_id", worldId)
            .order("position");
          if (error) toast.error(error.message);
          setCategories((data as CategoryOption[] | null) ?? []);
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatroom.id]);

  const titre = form.watch("title");

  const courants: Reglages = {
    title: titre?.trim() || null,
    timeline_date: timelineDate,
    map_pin_id: mapPinId,
    category_id: categoryId,
    visibility,
    synopsis: synopsis.trim() || null,
  };
  const patch = ecart(base, courants);
  // Les invités ne comptent que si le salon en a : revenu à « Ouvert », ceux
  // enregistrés restent en place pour un retour en public ou privé.
  const invitesModifies = visibilityHasInvitees(visibility) && !memesInvites(baseInvitees, invitees);
  const tempsModifie = !memeTemps(baseDay, day);
  const dirty = Object.keys(patch).length > 0 || invitesModifies || tempsModifie;

  // ---------- enregistrer ----------

  /** Écrit tous les réglages modifiés en une requête. */
  async function save(): Promise<boolean> {
    if (!dirty || saving) return true;
    if (!(await form.trigger("title"))) return false;
    setSaving(true);
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("chatrooms")
        .update(patch)
        .eq("id", chatroom.id)
        .select("id");
      // Une RLS qui refuse ne lève pas d'erreur : elle ne touche aucune ligne.
      if (error || !Array.isArray(data) || data.length !== 1) {
        setSaving(false);
        if (error) console.error("[ChatroomSettingsSheet] enregistrement", error);
        toast.error(tCommon("saveError"));
        return false;
      }
      setBase(courants);
    }
    if (invitesModifies) {
      if (!(await saveChatroomInvitees(supabase, chatroom.id, baseInvitees, invitees))) {
        setSaving(false);
        toast.error(tCommon("saveError"));
        return false;
      }
      setBaseInvitees(invitees);
    }
    if (tempsModifie) {
      const { error } = await supabase.rpc(RPC.SET_CHATROOM_DAY, {
        p_chat: chatroom.id,
        p_icon: day?.icon ?? null,
        p_position: day?.position ?? null,
      });
      if (error) {
        setSaving(false);
        console.error("[ChatroomSettingsSheet] temps du salon", error);
        toast.error(tDay("settingsFailed"));
        return false;
      }
      setBaseDay(day);
    }
    setSaving(false);
    toast.success(tCommon("changesSaved"));
    router.refresh();
    return true;
  }

  /** Abandonne : retour à l'état enregistré. */
  function discard() {
    form.reset({ title: base.title ?? "" });
    setTimelineDate(base.timeline_date);
    setMapPinId(base.map_pin_id);
    setCategoryId(base.category_id);
    setVisibility(base.visibility);
    setSynopsis(base.synopsis ?? "");
    setInvitees(baseInvitees);
    setDay(baseDay);
  }

  function requestOpenChange(next: boolean) {
    if (next || !dirty) { setOpen(next); return; }
    setConfirmClose(true);
  }

  // ---------- delete ----------

  /**
   * Supprime la salle au complet : l'action serveur supprime la ligne sous
   * notre identité (la base en décide), puis tous ses fichiers, médias des
   * messages compris.
   */
  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await deleteChatroom(chatroom.id);
      if (error) {
        toast.error(t("deleteRoomFailed"));
        return;
      }
      toast.success(t("roomDeleted"));
      setOpen(false);
      // Le salon n'existe plus : on ne revient pas en arrière vers lui. Pas
      // de `router.refresh()` ici : il relancerait le rendu du salon supprimé
      // en pleine navigation, et la page restait figée.
      if (worldId) router.replace(`/w/${worldId}`);
      else router.back();
    } catch (e: unknown) {
      console.error("[ChatroomSettingsSheet] suppression", e);
      toast.error(t("deleteRoomFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <Drawer open={open} onOpenChange={requestOpenChange} swipeDirection="right">
      {!hideTrigger && canEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DrawerTrigger
              aria-label={tCommon("settings")}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Settings className="h-4 w-4" />
            </DrawerTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>{tCommon("settings")}</TooltipContent>
        </Tooltip>
      )}

      <SideSheetContent width="chat">
        <DrawerHeader className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DrawerTitle>{t("settingsTitle")}</DrawerTitle>
        </DrawerHeader>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-6">

              {/* Nom */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("settingsNamePlaceholder")}
                        className="h-8 text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Synopsis */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="chatroom-synopsis" className="text-sm font-medium">{tAccess("synopsis")}</label>
                  <HelpHint title={tAccess("synopsis")}>{tAccess("synopsisHelp")}</HelpHint>
                </div>
                <Textarea
                  id="chatroom-synopsis"
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  placeholder={tAccess("synopsisPlaceholder")}
                  maxLength={SYNOPSIS_MAX_LENGTH}
                  className="max-h-60 min-h-20 text-sm"
                />
              </div>

              {/* Temps : météo et moment, affichés au-dessus du synopsis */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{tDay("settingsTitle")}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{tDay("settingsHelp")}</p>
                  </div>
                  <Switch
                    aria-label={tDay("settingsToggle")}
                    checked={day !== null}
                    onCheckedChange={(v) =>
                      setDay(v ? baseDay ?? { icon: DAY_DEFAULT_ICON, position: DAY_DEFAULT_POSITION } : null)
                    }
                  />
                </div>
                {day !== null && (
                  <ChatroomDayPicker
                    icon={day.icon}
                    position={day.position}
                    onChange={(icon, position) => setDay({ icon, position })}
                  />
                )}
              </div>

              {/* Accès : visibilité, puis les invités */}
              {worldId && (
                <div className="space-y-4">
                  <ChatroomVisibilityField value={visibility} onChange={setVisibility} />
                  {visibilityHasInvitees(visibility) && (
                    <ChatroomInviteesField
                      worldId={worldId}
                      value={invitees}
                      onChange={setInvitees}
                      label={visibility === "private" ? tAccess("inviteesMembers") : tAccess("inviteesWriters")}
                    />
                  )}
                </div>
              )}

              {/* Chronologie */}
              {worldTimelineConfig && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsTimeline")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {t("settingsTimelineHelp")}
                      </p>
                    </div>
                    <Switch
                      checked={timelineDate !== null}
                      onCheckedChange={(v) => {
                        setTimelineDate(v
                          ? clampTimelineDate(worldTimelineConfig, { year: worldTimelineConfig.current_year, month: worldTimelineConfig.current_month, day: null })
                          : null);
                      }}
                    />
                  </div>

                  {timelineDate !== null && (
                    <div className="ml-1 rounded-xl border border-border bg-muted/20 p-3">
                      <TimelineDatePicker
                        config={worldTimelineConfig}
                        value={timelineDate}
                        onCommit={setTimelineDate}
                      />
                      {/* L'arc du salon et le salon dont il est la suite. */}
                      {worldId && (
                        <div className="mt-3 border-t border-border pt-3">
                          <ChatroomTimelineLinks
                            chatroomId={chatroom.id}
                            worldId={worldId}
                            config={worldTimelineConfig}
                            supabase={supabase}
                            onSaved={() => { toast.success(tCommon("changesSaved")); router.refresh(); }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Catégorie */}
              {categories.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsCategory")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Regroupe cette conversation avec d&apos;autres dans la sidebar.
                      </p>
                    </div>
                    {categoryId && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setCategoryId(null)}
                      >
                        {t("settingsCategoryNone")}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id === categoryId ? null : cat.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                          categoryId === cat.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:bg-secondary",
                        )}
                      >
                        <CategoryAvatar
                          title={cat.title}
                          bannerUrl={cat.banner_url}
                          iconUrl={cat.icon_url}
                          letterClassName="text-2xs"
                          className="h-5 w-5 rounded-md"
                        />
                        {cat.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lieu */}
              {world_map && mapPins.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t("settingsLocation")}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Associe cette conversation à un lieu de la carte.
                      </p>
                    </div>
                    {mapPinId && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setMapPinId(null)}
                      >
                        Retirer
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {mapPins.map(pin => (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={() => setMapPinId(pin.id === mapPinId ? null : pin.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
                          mapPinId === pin.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:bg-secondary",
                        )}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
                        {pin.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <DrawerFooter className="border-t border-border px-4 py-3 sm:px-6 flex-row justify-start">
              <DeleteConfirmDialog
                description={t("roomDeleteDescription")}
                onConfirm={() => void handleDelete()}
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleting}
                  >
                    {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Supprimer la salle
                  </Button>
                }
              />
              {/* Rien n'est enregistré tant qu'on ne l'a pas demandé. Le bouton
                  reste en place, grisé tant qu'il n'y a rien à écrire. */}
              <Button
                type="button"
                className="ml-auto"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                {tCommon("save")}
              </Button>
            </DrawerFooter>
          </form>
        </Form>
      </SideSheetContent>
    </Drawer>

    {/* Fermer avec des réglages en attente : on demande plutôt que de les
        perdre en silence. */}
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settingsUnsavedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("settingsUnsavedDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => { setConfirmClose(false); discard(); setOpen(false); }}
          >
            {t("settingsUnsavedDiscard")}
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
