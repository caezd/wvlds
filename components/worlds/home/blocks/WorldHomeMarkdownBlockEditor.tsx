"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { MAX_HOME_BLOCK_CONTENT_LENGTH, MAX_HOME_BLOCK_TITLE_LENGTH } from "../worldHomeGrid";

/**
 * Édition du contenu d'un bloc Markdown. Ne persiste rien elle-même : rend
 * son résultat via `onSave`, à l'éditeur de grille parent qui l'intègre
 * dans la sauvegarde atomique de toute la grille (voir WorldHomeGridEditor.tsx).
 */
export function WorldHomeMarkdownBlockEditor({
  open,
  onOpenChange,
  initialContent,
  initialTitle,
  initialCard = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  initialTitle?: string;
  /** Défaut false — un bloc markdown n'a jamais eu de carte avant ce réglage. */
  initialCard?: boolean;
  onSave: (content: string, title: string, card: boolean) => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const [content, setContent] = React.useState(initialContent ?? "");
  const [title, setTitle] = React.useState(initialTitle ?? "");
  const [card, setCard] = React.useState(initialCard);

  React.useEffect(() => {
    if (open) {
      setContent(initialContent ?? "");
      setTitle(initialTitle ?? "");
      setCard(initialCard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialContent, initialTitle]);

  const tooLong = content.length > MAX_HOME_BLOCK_CONTENT_LENGTH;

  function handleSave() {
    if (tooLong || !content.trim()) return;
    onSave(content, title, card);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border-soft">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> {t("home.grid.markdownBlockTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label htmlFor="home-block-markdown-title" className="text-sm font-medium text-foreground">
              {t("home.grid.blockTitleLabel")}
            </label>
            <Input
              id="home-block-markdown-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("home.grid.markdownBlockTitle")}
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
            <label htmlFor="home-block-markdown" className="text-sm font-medium text-foreground">
              {t("home.grid.markdownLabel")}
            </label>
            <Textarea
              id="home-block-markdown"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("home.grid.markdownPlaceholder")}
              rows={12}
              className="font-mono text-xs"
              aria-invalid={tooLong}
            />
            <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
              {tooLong
                ? t("home.announcement.htmlTooLong", { max: MAX_HOME_BLOCK_CONTENT_LENGTH })
                : `${content.length} / ${MAX_HOME_BLOCK_CONTENT_LENGTH}`}
            </p>
          </div>

          {content.trim() && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">{t("home.announcement.previewLabel")}</p>
              <div className="max-h-64 overflow-y-auto rounded-lg border bg-background p-3">
                <MarkdownRenderer content={content} allowImages />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border-soft">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={tooLong || !content.trim()}>
            {tCommon("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
