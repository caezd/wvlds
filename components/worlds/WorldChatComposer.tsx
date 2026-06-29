"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { Plus, Shuffle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { toast } from "sonner";
import { TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MapPinOption = { id: string; title: string; color: string };

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

  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [title, setTitle] = useState("");
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    if (!world_map) return;
    void supabase
      .from("world_map_pins")
      .select("id, title, color")
      .eq("world_id", worldId)
      .order("sort_index")
      .then(({ data }: { data: MapPinOption[] | null }) => setMapPins(data ?? []));
  }, [worldId, world_map]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDialog() {
    setTitle(randomTitle());
    setHasContent(false);
    setOpen(true);
  }

  function requestClose() {
    if (hasContent) {
      setConfirmClose(true);
    } else {
      setOpen(false);
    }
  }

  function forceClose() {
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

  return (
    <>
      {/* Faux composer — visuel uniquement, ouvre le dialog au clic */}
      <button
        type="button"
        onClick={openDialog}
        className="w-full text-left rounded-2xl border border-border-soft bg-background px-4 py-3 text-sm text-muted-foreground hover:border-border hover:bg-secondary/30 transition-colors"
      >
        <Plus className="inline-block mr-2 h-3.5 w-3.5 opacity-50" />
        {t("composer.placeholder")}
      </button>

      {/* Dialog de création */}
      <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
        <DialogContent className="sm:max-w-2xl gap-4">
          <DialogHeader>
            <DialogTitle>{t("composer.dialogTitle")}</DialogTitle>
          </DialogHeader>

          {/* Champ titre */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("composer.titlePlaceholder")}
                className="pr-7"
                autoFocus
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
              variant="outline"
              size="icon"
              title={t("composer.titleRandomize")}
              onClick={() => setTitle(randomTitle())}
            >
              <Shuffle className="h-4 w-4" />
            </Button>
          </div>

          {/* Composer réel — onInput remonte depuis le contenteditable */}
          <div onInput={() => setHasContent(true)}>
            <ChatroomComposer
              presetPersona={persona}
              onPersonaChange={setPersona}
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
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation de fermeture si du texte a été saisi */}
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
    </>
  );
}
