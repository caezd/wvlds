"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, FlaskConical, Loader2, MessageSquare, PenLine } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ANNOUNCEMENT_TITLE_MAX,
  fetchWorldWelcome,
  saveWorldWelcome,
  type AnnouncementKind,
  type WorldWelcome,
} from "@/lib/worldAnnouncements";
import { FIELD, SettingsSection, StatusPill, ToggleItem, ToggleList } from "../FeatureLayout";
import { BodyEditor, KindPicker, isAnnouncementValid, useAnnouncementErrorMessage, useAnnouncementTest } from "./AnnouncementFields";

/**
 * Message de bienvenue (migration 229) : un modèle envoyé à chaque nouveau
 * membre, en message privé ou en notification, depuis le compte de la
 * dernière personne à l'avoir enregistré.
 */
export function WorldWelcomeSection({
  worldId,
  worldName,
  dmsEnabled,
  sample,
}: {
  worldId: string;
  worldName: string;
  dmsEnabled: boolean;
  sample: { username: string; world: string };
}) {
  const t = useTranslations("worlds.announcements.welcome");
  const tA = useTranslations("worlds.announcements");
  const tSettings = useTranslations("worlds.settings");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const errorMessage = useAnnouncementErrorMessage();
  // undefined : chargement ; null : jamais configuré.
  const [welcome, setWelcome] = React.useState<WorldWelcome | null | undefined>(undefined);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);

  const load = React.useCallback(async () => {
    setWelcome(await fetchWorldWelcome(supabase, worldId));
  }, [supabase, worldId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const enabled = !!welcome?.enabled;

  async function toggle(on: boolean) {
    // Rien à activer : on rédige d'abord.
    if (on && !welcome) {
      setEditorOpen(true);
      return;
    }
    if (!welcome) return;
    setToggling(true);
    const res = await saveWorldWelcome(supabase, {
      worldId,
      enabled: on,
      kind: welcome.kind,
      title: welcome.title ?? "",
      body: welcome.body,
    });
    setToggling(false);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    toast.success(on ? t("enabledToast") : t("disabledToast"));
    void load();
  }

  return (
    <SettingsSection
      title={t("title")}
      help={t("help")}
      aside={<StatusPill active={enabled} onLabel={tSettings("statusOn")} offLabel={tSettings("statusOff")} />}
    >
      <div data-testid="welcome-section" className="space-y-3">
        <ToggleList>
          <ToggleItem
            title={t("enable")}
            checked={enabled}
            disabled={welcome === undefined || toggling}
            onCheckedChange={(on) => void toggle(on)}
          />
        </ToggleList>
        {welcome ? (
          <div className="space-y-2 rounded-md border border-border bg-card p-3" data-testid="welcome-summary">
            <div className="flex items-center gap-2 text-sm">
              {welcome.kind === "message" ? (
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={tA("kindMessage")} />
              ) : (
                <Bell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={tA("kindNotification")} />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{welcome.title ?? welcome.body}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditorOpen(true)} data-testid="welcome-edit">
                <PenLine className="h-3.5 w-3.5" />
                {tCommon("edit")}
              </Button>
            </div>
            <p className="text-xs-plus text-muted-foreground">
              {t("sender", { name: welcome.author?.username ?? tA("unknownAuthor") })}
              {" · "}
              {t("sentCount", { count: welcome.sent_count })}
            </p>
          </div>
        ) : welcome === null ? (
          <Button type="button" variant="outline" onClick={() => setEditorOpen(true)} data-testid="welcome-edit">
            <PenLine className="h-4 w-4" />
            {t("write")}
          </Button>
        ) : null}
      </div>

      <WelcomeEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        worldId={worldId}
        worldName={worldName}
        dmsEnabled={dmsEnabled}
        sample={sample}
        initial={welcome ?? null}
        onSaved={() => {
          setEditorOpen(false);
          void load();
        }}
      />
    </SettingsSection>
  );
}

function WelcomeEditor({
  open,
  onOpenChange,
  worldId,
  worldName,
  dmsEnabled,
  sample,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worldId: string;
  worldName: string;
  dmsEnabled: boolean;
  sample: { username: string; world: string };
  initial: WorldWelcome | null;
  onSaved: () => void;
}) {
  const t = useTranslations("worlds.announcements.welcome");
  const tA = useTranslations("worlds.announcements");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const errorMessage = useAnnouncementErrorMessage();
  const { testing, sendTest } = useAnnouncementTest(worldId);

  const defaultKind: AnnouncementKind = dmsEnabled ? "message" : "notification";
  const [kind, setKind] = React.useState<AnnouncementKind>(defaultKind);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Le brouillon repart du modèle enregistré à chaque ouverture.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(initial ? (initial.kind === "message" && !dmsEnabled ? "notification" : initial.kind) : defaultKind);
      setTitle(initial?.title ?? "");
      setBody(initial?.body ?? "");
      setPreview(false);
    }
  }

  const valid = isAnnouncementValid(kind, title, body);

  async function save() {
    setSaving(true);
    const res = await saveWorldWelcome(supabase, { worldId, enabled: true, kind, title, body });
    setSaving(false);
    if (!res.ok) {
      toast.error(errorMessage(res.reason));
      return;
    }
    toast.success(t("saved"));
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="welcome-editor">
        <DialogHeader>
          <DialogTitle>{t("editorTitle")}</DialogTitle>
          <DialogDescription>{t("editorDescription")}</DialogDescription>
        </DialogHeader>
        <div className="@container max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <SectionLabel as="div">{tA("kind")}</SectionLabel>
            <KindPicker kind={kind} onChange={setKind} dmsEnabled={dmsEnabled} testIdPrefix="welcome" />
          </div>
          {kind === "notification" && (
            <div className="space-y-2">
              <SectionLabel as="div">{tA("titleLabel")}</SectionLabel>
              <Input
                value={title}
                maxLength={ANNOUNCEMENT_TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                aria-label={tA("titleLabel")}
                data-testid="welcome-title"
                className={FIELD}
              />
            </div>
          )}
          <div className="space-y-2">
            <BodyEditor
              kind={kind}
              title={title}
              body={body}
              onBodyChange={setBody}
              preview={preview}
              sample={sample}
              worldName={worldName}
              testIdPrefix="welcome"
            />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!valid || testing}
            onClick={() => void sendTest(kind, title, body)}
            title={kind === "message" ? tA("sendTestMessageHelp") : tA("sendTestHelp")}
            data-testid="welcome-test"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {tA("sendTest")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? tCommon("edit") : tCommon("preview")}
          </Button>
          <Button type="button" disabled={!valid || saving} onClick={() => void save()} data-testid="welcome-save">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
