"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { setWorldAnnouncement } from "@/app/actions/worldCatalog";
import { MAX_ANNOUNCEMENT_HTML_LENGTH } from "@/components/worlds/home/worldHomeWidgets";
import type { AnnouncementSize } from "@/components/worlds/home/widgets/WorldAnnouncementWidget";
import type { World } from "@/types/worlds";

const SIZES: AnnouncementSize[] = ["sm", "md", "lg"];
const PREVIEW_HEIGHT: Record<AnnouncementSize, number> = { sm: 120, md: 200, lg: 280 };

/**
 * Onglet Réglages « Page d'accueil » : édition du widget Annonce (HTML/CSS
 * libre, rendu ailleurs dans une iframe sandboxée — voir WorldAnnouncementWidget).
 */
export function WorldAnnouncementSettings({ world }: { world: World }) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [html, setHtml] = React.useState(world.announcement_html ?? "");
  const [size, setSize] = React.useState<AnnouncementSize>(
    (world.announcement_size as AnnouncementSize | null) ?? "md",
  );
  const [saving, setSaving] = React.useState(false);

  const tooLong = html.length > MAX_ANNOUNCEMENT_HTML_LENGTH;

  async function handleSave() {
    if (tooLong) return;
    setSaving(true);
    const res = await setWorldAnnouncement(world.id, html, size);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("worldSaved"));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="announcement-html" className="text-sm font-medium text-foreground">
          {t("home.announcement.htmlLabel")}
        </label>
        <Textarea
          id="announcement-html"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder={t("home.announcement.htmlPlaceholder")}
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
          aria-invalid={tooLong}
        />
        <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {tooLong
            ? t("home.announcement.htmlTooLong", { max: MAX_ANNOUNCEMENT_HTML_LENGTH })
            : `${html.length} / ${MAX_ANNOUNCEMENT_HTML_LENGTH}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{t("home.announcement.sizeLabel")}</label>
        <div className="flex gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                size === s
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border-soft text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {t(`home.announcement.size${s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}`)}
            </button>
          ))}
        </div>
      </div>

      {html.trim() && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{t("home.announcement.previewLabel")}</p>
          <iframe
            sandbox=""
            srcDoc={html}
            title={t("home.announcement.previewLabel")}
            style={{ height: PREVIEW_HEIGHT[size] }}
            className="w-full rounded-lg border bg-background"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || tooLong}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
