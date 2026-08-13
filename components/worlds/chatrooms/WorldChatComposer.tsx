"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { ChevronDown, Plus, Shuffle, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { toast } from "sonner";
import { TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { ChatroomComposer, type ChatroomComposerHandle } from "@/components/chatrooms/composer/ChatroomComposer";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryAvatar } from "@/components/worlds/catalogue/CategoryAvatar";

type MapPinOption = { id: string; title: string; color: string };
type CategoryOption = { id: string; title: string; banner_url: string | null; icon_url: string | null };

function randomTitle() {
  try { return generate({ words: 2 }).spaced; }
  catch { return "Conversation"; }
}

export function WorldChatComposer({
  worldId,
  timelineConfig,
}: {
  worldId: string;
  timelineConfig?: WorldTimelineConfig | null;
}) {
  const t = useTranslations("worlds");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const { world_map } = useFeatureFlags();

  const [persona, setPersona] = useState<Persona | null>(null);
  const [timelineDate, setTimelineDate] = useState<WorldTimelineDate | null>(null);
  const [mapPins, setMapPins] = useState<MapPinOption[]>([]);
  const [mapPinId, setMapPinId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [title, setTitle] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const composerRef = useRef<ChatroomComposerHandle>(null);

  // Sur mobile, le dialog de création (et sa confirmation d'abandon) devient
  // un drawer bottom — cohérent avec le composer qu'il contient, qui reste
  // lui-même inline en mode création (cf. `useMobileDrawer` dans
  // ChatroomComposer) : un seul système de modal actif à la fois évite le
  // conflit Radix Dialog / Base UI Drawer (aria-hidden croisé qui rendait
  // l'éditeur infocusable quand les deux étaient imbriqués).
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
  }, [worldId, world_map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("chatroom_categories")
        .select("id, title, banner_url, icon_url")
        .eq("world_id", worldId)
        .order("position");
      if (error) { toast.error(error.message); return; }
      setCategories((data as CategoryOption[] | null) ?? []);
    })();
  }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDialog() {
    setTitle(randomTitle());
    setHasContent(false);
    setOpen(true);
  }

  function requestClose() {
    if (hasContent) {
      setConfirmClose(true);
    } else {
      // Pas de nouvelle saisie depuis l'ouverture, mais un brouillon d'une
      // session précédente a pu être restauré silencieusement (hasContent ne
      // suit que les événements onInput) — on le vide quand même pour ne pas
      // le laisser traîner en local.
      forceClose();
    }
  }

  function forceClose() {
    // Vide le composer et son brouillon persisté (localStorage) : sans ça,
    // le texte réapparaîtrait à la prochaine ouverture du dialog malgré la
    // confirmation d'abandon.
    composerRef.current?.clearDraft();
    setConfirmClose(false);
    setOpen(false);
    setHasContent(false);
  }

  async function resolveChat(): Promise<{ chatId: string } | null> {
    if (!userId) {
      toast.error(t("composer.errorNotConnected"));
      return null;
    }

    const insert: Record<string, unknown> = {
      world_id: worldId,
      title: title.trim() || randomTitle(),
      created_by: userId,
    };
    if (timelineDate !== null) insert.timeline_date = timelineDate;
    if (mapPinId !== null) insert.map_pin_id = mapPinId;
    if (categoryId !== null) insert.category_id = categoryId;

    const { data: room, error } = await supabase
      .from(TABLE.CHATROOMS)
      .insert(insert)
      .select("id")
      .single();

    if (error || !room) {
      toast.error(error?.message ?? t("composer.errorCreateFailed"));
      return null;
    }
    return { chatId: room.id };
  }

  const titleRow = (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("composer.titlePlaceholder")}
          className={cn("pr-7", isMobile && "text-sm")}
          autoFocus={!isMobile}
        />
        {title && (
          <button
            type="button"
            onClick={() => setTitle("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("composer.titleClear")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="rounded-md"
        size="icon"
        title={t("composer.titleRandomize")}
        onClick={() => setTitle(randomTitle())}
      >
        <Shuffle className="h-4 w-4" />
      </Button>
      {categories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="shrink-0 gap-1.5 max-w-40">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {categoryId
                  ? (categories.find((c) => c.id === categoryId)?.title ?? t("composer.categoryPlaceholder"))
                  : t("composer.categoryPlaceholder")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {categories.map((cat) => (
              <DropdownMenuItem key={cat.id} onClick={() => setCategoryId(cat.id)}>
                <CategoryAvatar
                  title={cat.title}
                  bannerUrl={cat.banner_url}
                  iconUrl={cat.icon_url}
                  letterClassName="text-[8px]"
                  className="mr-2 h-4 w-4 rounded-sm"
                />
                {cat.title}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setCategoryId(null)}>
              <span className="mr-2 h-4 w-4 shrink-0 rounded-sm border border-border" />
              {t("composer.categoryNone")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  // onInput remonte depuis le contenteditable du composer.
  const composerBlock = (
    <div onInput={() => setHasContent(true)} className={isMobile ? "h-full" : undefined}>
      <ChatroomComposer
        ref={composerRef}
        presetPersona={persona}
        onPersonaChange={setPersona}
        worldId={worldId}
        placeholder={t("composer.placeholder")}
        onResolveChat={resolveChat}
        onAfterSend={(chatId) => {
          setOpen(false);
          setHasContent(false);
          router.push(`/c/${chatId}`);
        }}
        worldTimelineConfig={timelineConfig ?? null}
        timelineDate={timelineDate}
        onTimelineDateChange={setTimelineDate}
        mapPins={mapPins}
        mapPinId={mapPinId}
        onMapPinChange={setMapPinId}
        fillHeight
      />
    </div>
  );

  return (
    <>
      {/* Faux composer — visuel uniquement, ouvre le dialog/drawer au clic */}
      <button
        type="button"
        onClick={openDialog}
        className="w-full text-left rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground hover:border-border hover:bg-secondary/30 transition-colors"
      >
        <Plus className="inline-block mr-2 h-3.5 w-3.5 opacity-50" />
        {t("composer.placeholder")}
      </button>

      {isMobile ? (
        /* Drawer de création (mobile) — même visuel « plein écran, chrome
           minimal » que le composer lui-même : le DrawerContent ne porte ni
           padding ni bordure, les cartes internes (en-tête titre/catégorie,
           composer) fournissent leur propre habillage. */
        <Drawer open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
          <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] [--drawer-inset:8px] p-0 border-0 bg-transparent">
            <DrawerTitle className="sr-only">{t("composer.dialogTitle")}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("composer.placeholder")}</DrawerDescription>
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="shrink-0 rounded-3xl border border-border-soft bg-background p-2.5">
                {titleRow}
              </div>
              <div className="flex-1 min-h-0">
                {composerBlock}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        /* Dialog de création (desktop) */
        <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
          <DialogContent className="sm:max-w-2xl gap-4">
            <DialogHeader>
              <DialogTitle>{t("composer.dialogTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("composer.placeholder")}</DialogDescription>
            </DialogHeader>
            {titleRow}
            {composerBlock}
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation de fermeture si du texte a été saisi */}
      {isMobile ? (
        <Drawer open={confirmClose} onOpenChange={setConfirmClose} showSwipeHandle>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t("composer.discardTitle")}</DrawerTitle>
              <DrawerDescription>{t("composer.discardDescription")}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="flex-row gap-2">
              <DrawerClose render={<Button variant="outline" className="flex-1" />}>
                {t("composer.discardCancel")}
              </DrawerClose>
              <Button className="flex-1" onClick={forceClose}>
                {t("composer.discardConfirm")}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("composer.discardTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("composer.discardDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("composer.discardCancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={forceClose}>
                {t("composer.discardConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
