"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { Plus, Shuffle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { RPC, TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { clampTimelineDate, compareTimelineDates } from "@/lib/worldTimeline";
import {
  SYNOPSIS_MAX_LENGTH,
  saveChatroomInvitees,
  visibilityHasInvitees,
  type ChatroomInvitee,
  type ChatroomVisibility,
} from "@/lib/chatroomAccess";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLabel } from "@/components/ui/section-label";
import { HelpHint } from "@/components/ui/help-hint";
import { TimelineDatePicker } from "@/components/worlds/timeline/TimelineDatePicker";
import { ChatroomVisibilityField } from "@/components/chatrooms/access/ChatroomVisibilityField";
import { ChatroomInviteesField } from "@/components/chatrooms/access/ChatroomInviteesField";
import { ChatroomDayPicker } from "@/components/chatrooms/day/ChatroomDayPicker";
import { DAY_DEFAULT_ICON, DAY_DEFAULT_POSITION } from "@/lib/chatroomDay";
import { addCreatedWorldRoom } from "@/lib/worldRoomsStore";

type MapPinOption = { id: string; title: string; color: string };
type CategoryOption = { id: string; title: string };
type LinkableRoom = {
  id: string;
  title: string | null;
  timeline_date: WorldTimelineDate | null;
  mine: boolean;
  last_at: string | null;
};

function randomTitle() {
  try { return generate({ words: 2 }).spaced; }
  catch { return "Conversation"; }
}

/** « Aucun » dans une liste : le Select de l'application refuse la valeur vide. */
const NONE = "__none__";

/** Un champ du formulaire : son intitulé, éventuellement son aide, puis le contrôle. */
function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel as="div">
          {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        </SectionLabel>
        {hint}
      </div>
      {children}
    </div>
  );
}

/**
 * Créer un salon : il s'ouvre vide, avec ses options (lieu, catégorie, place
 * dans la chronologie), qui peut y lire et y écrire, et un synopsis. On n'y
 * écrit plus le premier message : on arrive dans le salon une fois créé.
 *
 * Un dialogue sur ordinateur, un tiroir sur mobile.
 */
export function NewChatroomDialog({
  worldId,
  timelineConfig,
  initialMapPinId,
}: {
  worldId: string;
  timelineConfig?: WorldTimelineConfig | null;
  /**
   * Lieu de la carte sur lequel ouvrir le formulaire dès l'arrivée — « Jouer
   * ici » depuis le panneau d'un lieu. Il s'ouvre de lui-même, situé, et
   * efface le paramètre de l'adresse pour qu'un rafraîchissement ne le
   * rouvre pas.
   */
  initialMapPinId?: string | null;
}) {
  const t = useTranslations("worlds.composer");
  const tAccess = useTranslations("chatrooms.access");
  const tDay = useTranslations("chatrooms.dayStatus");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const { world_map } = useFeatureFlags();
  const ids = useId();

  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [mapPinId, setMapPinId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [timelineDate, setTimelineDate] = useState<WorldTimelineDate | null>(null);
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ChatroomVisibility>("open");
  const [invitees, setInvitees] = useState<ChatroomInvitee[]>([]);
  const [synopsis, setSynopsis] = useState("");
  // Le temps du salon (migration 275), posé par sa RPC une fois le salon créé.
  const [day, setDay] = useState<{ icon: string; position: number } | null>(null);

  const [mapPins, setMapPins] = useState<MapPinOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [linkable, setLinkable] = useState<LinkableRoom[]>([]);

  // Sur mobile, un tiroir plutôt qu'un dialogue.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!world_map) return;
    void supabase
      .from("world_map_pins")
      .select("id, title, color")
      .eq("world_id", worldId)
      .order("sort_index")
      .then(({ data }: { data: MapPinOption[] | null }) => setMapPins(data ?? []));
  }, [supabase, worldId, world_map]);

  useEffect(() => {
    void supabase
      .from("chatroom_categories")
      .select("id, title")
      .eq("world_id", worldId)
      .order("position")
      .then(({ data }: { data: CategoryOption[] | null }) => setCategories(data ?? []));
  }, [supabase, worldId]);

  const dateRequired = !!timelineConfig?.require_date;

  // Pas de suite à rebours : une fois le salon daté, seuls les salons situés
  // au plus tard à sa date (la base le refuse aussi, migration 195).
  const sequelChoices = useMemo(
    () => linkable.filter((r) => !(timelineDate && r.timeline_date && compareTimelineDates(r.timeline_date, timelineDate) === 1)),
    [linkable, timelineDate],
  );
  useEffect(() => {
    if (previousId && !sequelChoices.some((r) => r.id === previousId)) setPreviousId(null);
  }, [previousId, sequelChoices]);

  function currentPeriod(config: WorldTimelineConfig): WorldTimelineDate {
    return clampTimelineDate(config, { year: config.current_year, month: config.current_month, day: null });
  }

  function openDialog(pinId: string | null = null) {
    setTitle(randomTitle());
    setMapPinId(pinId);
    setCategoryId(null);
    setPreviousId(null);
    setVisibility("open");
    setInvitees([]);
    setSynopsis("");
    setDay(null);
    setTimelineDate(dateRequired && timelineConfig ? currentPeriod(timelineConfig) : null);
    if (timelineConfig) {
      void supabase
        .rpc(RPC.GET_LINKABLE_CHATROOMS, { p_world_id: worldId })
        .then(({ data, error }: { data: LinkableRoom[] | null; error: unknown }) => {
          if (error) {
            console.error("[NewChatroomDialog] salons à relier", error);
            return;
          }
          // Les plus récemment joués d'abord.
          setLinkable([...(data ?? [])].sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? "")));
        });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!initialMapPinId) return;
    openDialog(initialMapPinId);
    const url = new URL(window.location.href);
    url.searchParams.delete("play");
    window.history.replaceState(null, "", url.toString());
    // Une ouverture par lieu reçu dans l'adresse, pas une par rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMapPinId]);

  // Ce qui serait perdu en fermant : le titre tiré au hasard ne compte pas.
  const dirty =
    synopsis.trim() !== "" || invitees.length > 0 || visibility !== "open" || previousId !== null || day !== null;

  function requestClose() {
    if (submitting) return;
    if (dirty) setConfirmClose(true);
    else setOpen(false);
  }

  function forceClose() {
    setConfirmClose(false);
    setOpen(false);
  }

  async function create() {
    if (submitting) return;
    if (!userId) {
      toast.error(t("errorNotConnected"));
      return;
    }
    if (dateRequired && timelineDate === null) {
      toast.error(t("dateRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const roomTitle = title.trim() || randomTitle();
      const { data: room, error } = await supabase
        .from(TABLE.CHATROOMS)
        .insert({
          world_id: worldId,
          title: roomTitle,
          created_by: userId,
          visibility,
          synopsis: synopsis.trim() || null,
          timeline_date: timelineDate,
          map_pin_id: mapPinId,
          category_id: categoryId,
        })
        .select("id")
        .single();
      if (error || !room) {
        toast.error(error?.message ?? t("errorCreateFailed"));
        return;
      }

      // Les invités, le temps puis la suite, une fois le salon créé. Un échec
      // ne retient pas le salon : chacun se refait depuis ses réglages.
      if (visibilityHasInvitees(visibility) && invitees.length > 0) {
        const ok = await saveChatroomInvitees(supabase, room.id, [], invitees);
        if (!ok) toast.error(t("inviteesFailed"));
      }
      if (day) {
        const { error: dayError } = await supabase.rpc(RPC.SET_CHATROOM_DAY, {
          p_chat: room.id,
          p_icon: day.icon,
          p_position: day.position,
        });
        if (dayError) {
          console.error("[NewChatroomDialog] temps du salon", dayError);
          toast.error(tDay("settingsFailed"));
        }
      }
      if (previousId) {
        const { data: link, error: linkError } = await supabase
          .from(TABLE.CHATROOM_SEQUELS)
          .insert({ world_id: worldId, chatroom_id: room.id, previous_id: previousId })
          .select("status")
          .maybeSingle();
        if (linkError) {
          console.error("[NewChatroomDialog] suite", linkError);
          toast.error(t("sequelFailed"));
        } else if ((link as { status: string } | null)?.status === "pending") {
          toast.success(t("sequelProposed"));
        }
      }

      // La barre latérale, dans un layout partagé, ne relit pas ses salons
      // en naviguant : on lui apprend celui-ci, parmi les récents.
      addCreatedWorldRoom(worldId, { id: room.id, title: roomTitle, category_id: categoryId });
      setOpen(false);
      router.push(`/c/${room.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const showLocation = world_map && mapPins.length > 0;

  const body = (
    <div className="space-y-5">
      {/* Titre */}
      <Field label={t("titleLabel")} htmlFor={`${ids}-title`}>
        <div className="relative">
          <Input
            id={`${ids}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={200}
            className="pr-16"
            autoFocus={!isMobile}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
            {title && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setTitle("")}
                className="size-7"
                aria-label={t("titleClear")}
              >
                <X className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTitle(randomTitle())}
              className="size-7"
              aria-label={t("titleRandomize")}
              title={t("titleRandomize")}
            >
              <Shuffle className="size-3.5" />
            </Button>
          </div>
        </div>
      </Field>

      {/* Lieu et catégorie */}
      {(showLocation || categories.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {showLocation && (
            <Field label={t("locationLabel")} htmlFor={`${ids}-pin`}>
              <Select value={mapPinId ?? NONE} onValueChange={(v) => setMapPinId(v === NONE ? null : v)}>
                <SelectTrigger id={`${ids}-pin`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("locationNone")}</SelectItem>
                  {mapPins.map((pin) => (
                    <SelectItem key={pin.id} value={pin.id}>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
                      {pin.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {categories.length > 0 && (
            <Field label={t("categoryPlaceholder")} htmlFor={`${ids}-category`}>
              <Select value={categoryId ?? NONE} onValueChange={(v) => setCategoryId(v === NONE ? null : v)}>
                <SelectTrigger id={`${ids}-category`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("categoryNone")}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      )}

      {/* Chronologie : la date (imposée ou non par le monde), puis la suite. */}
      {timelineConfig && (
        <Field
          label={t("timelineLabel")}
          hint={
            !dateRequired && (
              <Switch
                checked={timelineDate !== null}
                onCheckedChange={(v) => setTimelineDate(v ? currentPeriod(timelineConfig) : null)}
                aria-label={t("dateToggle")}
              />
            )
          }
        >
          {timelineDate !== null && (
            <section aria-label={t("dateSection")} className="rounded-lg border border-border bg-muted/30 p-3">
              <TimelineDatePicker config={timelineConfig} value={timelineDate} onCommit={setTimelineDate} />
            </section>
          )}
          {sequelChoices.length > 0 && (
            // Sans suite, la valeur reste vide : l'intitulé « (facultatif) » s'affiche.
            <Select value={previousId ?? ""} onValueChange={(v) => setPreviousId(v === NONE ? null : v)}>
              <SelectTrigger aria-label={t("sequelOf")} className="w-full">
                <SelectValue placeholder={t("sequelNone")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("categoryNone")}</SelectItem>
                {sequelChoices.some((r) => r.mine) && (
                  <SelectGroup>
                    <SelectLabel>{t("sequelMine")}</SelectLabel>
                    {sequelChoices.filter((r) => r.mine).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title ?? ""}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {sequelChoices.some((r) => !r.mine) && (
                  <SelectGroup>
                    <SelectLabel>{t("sequelOthers")}</SelectLabel>
                    {sequelChoices.filter((r) => !r.mine).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title ?? ""}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <ChatroomVisibilityField value={visibility} onChange={setVisibility} />

      {visibilityHasInvitees(visibility) && (
        <ChatroomInviteesField
          worldId={worldId}
          value={invitees}
          onChange={setInvitees}
          label={visibility === "private" ? tAccess("inviteesMembers") : tAccess("inviteesWriters")}
        />
      )}

      {/* Le temps du salon, affiché au-dessus du synopsis. */}
      <Field
        label={tDay("settingsTitle")}
        hint={
          <Switch
            checked={day !== null}
            onCheckedChange={(v) => setDay(v ? { icon: DAY_DEFAULT_ICON, position: DAY_DEFAULT_POSITION } : null)}
            aria-label={tDay("settingsToggle")}
          />
        }
      >
        {day !== null && (
          <section aria-label={tDay("label")} className="rounded-lg border border-border bg-muted/30 p-3">
            <ChatroomDayPicker
              icon={day.icon}
              position={day.position}
              onChange={(icon, position) => setDay({ icon, position })}
            />
          </section>
        )}
      </Field>

      <Field
        label={tAccess("synopsis")}
        htmlFor={`${ids}-synopsis`}
        hint={<HelpHint title={tAccess("synopsis")}>{tAccess("synopsisHelp")}</HelpHint>}
      >
        <Textarea
          id={`${ids}-synopsis`}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder={tAccess("synopsisPlaceholder")}
          maxLength={SYNOPSIS_MAX_LENGTH}
          className="max-h-60 min-h-24"
        />
      </Field>
    </div>
  );

  const createButton = (
    <Button type="button" onClick={() => void create()} disabled={submitting} className={cn(isMobile && "flex-1")}>
      {tCommon("create")}
    </Button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => openDialog()}
        className="w-full rounded-lg border bg-background px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Plus className="mr-2 inline-block size-3.5" aria-hidden />
        {t("placeholder")}
      </button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={(next) => { if (!next) requestClose(); }} showSwipeHandle>
          {/* Toute la hauteur, moins la marge du tiroir ; l'arrondi du dialogue sur ordinateur. */}
          <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] rounded-lg">
            <DrawerHeader>
              <DrawerTitle>{t("dialogTitle")}</DrawerTitle>
              <DrawerDescription className="sr-only">{t("dialogDescription")}</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{body}</div>
            <DrawerFooter className="flex-row gap-2 border-t border-border">
              <Button type="button" variant="secondary" className="flex-1" onClick={requestClose}>
                {tCommon("cancel")}
              </Button>
              {createButton}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("dialogTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("dialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 py-1">{body}</div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={requestClose}>
                {tCommon("cancel")}
              </Button>
              {createButton}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation avant d'abandonner un formulaire entamé */}
      {isMobile ? (
        <Drawer open={confirmClose} onOpenChange={setConfirmClose} showSwipeHandle>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t("discardTitle")}</DrawerTitle>
              <DrawerDescription>{t("discardDescription")}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex-row gap-2">
              <DrawerClose render={<Button variant="secondary" className="flex-1" />}>
                {t("discardCancel")}
              </DrawerClose>
              <Button className="flex-1" onClick={forceClose}>
                {t("discardConfirm")}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("discardDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("discardCancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={forceClose}>{t("discardConfirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
