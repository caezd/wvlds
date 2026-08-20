"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Code2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_HOME_BLOCK_CONTENT_LENGTH, MAX_HOME_BLOCK_TITLE_LENGTH } from "../worldHomeGrid";

/**
 * Édition du contenu d'un bloc HTML custom — HTML/CSS libre, jamais de JS
 * (voir WorldHomeGridView.tsx : rendu final dans une iframe sandboxée sans
 * allow-scripts, une garantie du navigateur plutôt qu'un filtrage de
 * contenu). Ne persiste rien elle-même : rend son résultat via `onSave`, à
 * l'éditeur de grille parent qui l'intègre dans la sauvegarde atomique de
 * toute la grille (voir WorldHomeGridEditor.tsx).
 */
export function WorldHomeHtmlBlockEditor({
  open,
  onOpenChange,
  initialHtml,
  initialTitle,
  initialCard = true,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialHtml?: string;
  initialTitle?: string;
  /** Défaut true — un bloc html a toujours été rendu en carte avant ce réglage. */
  initialCard?: boolean;
  onSave: (html: string, title: string, card: boolean) => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const [html, setHtml] = React.useState(initialHtml ?? "");
  const [title, setTitle] = React.useState(initialTitle ?? "");
  const [card, setCard] = React.useState(initialCard);

  React.useEffect(() => {
    if (open) {
      setHtml(initialHtml ?? "");
      setTitle(initialTitle ?? "");
      setCard(initialCard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialHtml, initialTitle]);

  const tooLong = html.length > MAX_HOME_BLOCK_CONTENT_LENGTH;

  function handleSave() {
    if (tooLong || !html.trim()) return;
    onSave(html, title, card);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border-soft">
          <SheetTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" /> {t("home.grid.htmlBlockTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label htmlFor="home-block-html-title" className="text-sm font-medium text-foreground">
              {t("home.grid.blockTitleLabel")}
            </label>
            <Input
              id="home-block-html-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("home.grid.htmlBlockTitle")}
              maxLength={MAX_HOME_BLOCK_TITLE_LENGTH}
            />
            <p className="text-xs text-muted-foreground">{t("home.grid.blockTitleHelp")}</p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border-soft p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{t("home.grid.cardLabel")}</p>
              <p className="text-xs text-muted-foreground leading-snug">{t("home.grid.cardHelp")}</p>
            </div>
            <Switch checked={card} onCheckedChange={setCard} className="shrink-0" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="home-block-html" className="text-sm font-medium text-foreground">
              {t("home.announcement.htmlLabel")}
            </label>
            <Textarea
              id="home-block-html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder={t("home.announcement.htmlPlaceholder")}
              rows={12}
              spellCheck={false}
              className="font-mono text-xs"
              aria-invalid={tooLong}
            />
            <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
              {tooLong
                ? t("home.announcement.htmlTooLong", { max: MAX_HOME_BLOCK_CONTENT_LENGTH })
                : `${html.length} / ${MAX_HOME_BLOCK_CONTENT_LENGTH}`}
            </p>
          </div>

          {html.trim() && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">{t("home.announcement.previewLabel")}</p>
              <iframe
                sandbox=""
                srcDoc={html}
                title={t("home.announcement.previewLabel")}
                className="h-64 w-full rounded-lg border bg-background"
              />
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border-soft">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={tooLong || !html.trim()}>
            {tCommon("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
