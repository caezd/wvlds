"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  isAnnouncementLabel,
  updateWorldAnnouncement,
  type AnnouncementExtras,
  type WorldAnnouncement,
} from "@/lib/worldAnnouncements";
import {
  AnnouncementExtrasFields,
  type AnnouncementExtrasValue,
} from "@/components/worlds/announcements/AnnouncementExtrasFields";
import { useAnnouncementImageDrafts } from "@/components/worlds/announcements/useAnnouncementImageDrafts";
import { useAnnouncementErrorMessage } from "./AnnouncementFields";

function extrasDe(a: WorldAnnouncement): AnnouncementExtrasValue {
  return {
    label: isAnnouncementLabel(a.label) ? a.label : null,
    imageUrl: a.image_url ?? null,
    showOnHome: !!a.show_on_home,
    pinned: !!a.pinned_at,
  };
}

/**
 * Modifier une annonce envoyée (migration 235) : titre, texte, étiquette,
 * image, accueil, épingle. Notifications, messages privés et bandeaux suivent.
 * Le contenu d'une annonce retirée ne se modifie plus ; ses options, si.
 */
export function AnnouncementEditDialog({
  announcement: a,
  open,
  onOpenChange,
  onSaved,
}: {
  announcement: WorldAnnouncement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const errorMessage = useAnnouncementErrorMessage();
  const supabase = React.useMemo(() => createClient(), []);
  const [title, setTitle] = React.useState(a.title ?? "");
  const [body, setBody] = React.useState(a.body);
  const [extras, setExtras] = React.useState<AnnouncementExtrasValue>(() => extrasDe(a));
  const [saving, setSaving] = React.useState(false);
  const images = useAnnouncementImageDrafts(extras.imageUrl);
  const { discardAll } = images;

  // Rouvert sur une autre annonce (ou la même, rechargée) : on repart d'elle.
  // Fermé sans enregistrer : les images téléversées entre-temps partent.
  React.useEffect(() => {
    if (!open) {
      discardAll();
      return;
    }
    setTitle(a.title ?? "");
    setBody(a.body);
    setExtras(extrasDe(a));
  }, [open, a, discardAll]);

  const contentEditable = !a.retracted_at;
  const hasTitle = a.kind !== "message";
  const titleChanged = hasTitle && title.trim() !== (a.title ?? "");
  const bodyChanged = body.trim() !== a.body;
  const avant = extrasDe(a);
  const changedExtras: AnnouncementExtras = {};
  if (extras.label !== avant.label) changedExtras.label = extras.label;
  if (extras.imageUrl !== avant.imageUrl) changedExtras.imageUrl = extras.imageUrl;
  if (extras.showOnHome !== avant.showOnHome) changedExtras.showOnHome = extras.showOnHome;
  if (extras.pinned !== avant.pinned) changedExtras.pinned = extras.pinned;
  const dirty = titleChanged || bodyChanged || Object.keys(changedExtras).length > 0;
  const valid = body.trim().length > 0 && (!hasTitle || title.trim().length > 0);

  async function save() {
    setSaving(true);
    const res = await updateWorldAnnouncement(supabase, a.id, {
      ...(contentEditable && titleChanged ? { title } : {}),
      ...(contentEditable && bodyChanged ? { body } : {}),
      extras: changedExtras,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    toast.success(t("editSaved"));
    images.keep(extras.imageUrl);
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] max-w-lg overflow-y-auto" data-testid="announcement-edit">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{contentEditable ? t("editHelp") : t("editRetractedHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {hasTitle && (
            <Input
              value={title}
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t("titleLabel")}
              disabled={!contentEditable}
              data-testid="announcement-edit-title"
            />
          )}
          <Textarea
            value={body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            aria-label={t("body")}
            disabled={!contentEditable}
            rows={6}
            data-testid="announcement-edit-body"
          />
          <AnnouncementExtrasFields value={extras} onChange={setExtras} onUploaded={images.track} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!dirty || !valid || saving} data-testid="announcement-edit-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
