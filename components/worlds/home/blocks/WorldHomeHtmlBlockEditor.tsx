"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Code2 } from "lucide-react";
import { Drawer, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  MAX_HOME_BLOCK_CONTENT_LENGTH,
  MAX_HOME_BLOCK_CSS_LENGTH,
  MAX_HOME_BLOCK_HEIGHT,
  MAX_HOME_BLOCK_TITLE_LENGTH,
  MIN_HOME_BLOCK_HEIGHT,
  sanitizeBlockHeight,
} from "../worldHomeGrid";
import { WorldHomeHtmlBlockView } from "./WorldHomeHtmlBlockView";

/**
 * Exemples affichés dans les champs vides. Volontairement hors du catalogue de
 * messages : un extrait de code est le même dans toutes les langues, et ses
 * accolades entrent en conflit avec la syntaxe ICU de next-intl — un message
 * qui en contient échoue à l'analyse, et c'est le chemin de la clé qui
 * s'affiche à sa place.
 */
const HTML_PLACEHOLDER = '<div class="bloc">…</div>';
const CSS_PLACEHOLDER = ":scope { padding: 1rem; }";

/**
 * Édition d'un bloc HTML custom : balisage et feuille de style dans deux
 * onglets, plutôt qu'un champ unique « HTML / CSS » où la seconde se glissait
 * dans une balise `<style>` au milieu du premier.
 *
 * Le balisage est assaini par liste blanche au rendu (voir homeHtmlBlock.ts) :
 * aucun script ne peut s'exécuter, et une balise absente de la liste
 * disparaît. L'aperçu ci-dessous emploie le composant de rendu public réel,
 * pas une approximation — ce qui s'y affiche est donc exactement ce que
 * verront les membres, assainissement compris.
 *
 * Ne persiste rien elle-même : rend son résultat via `onSave`, à l'éditeur de
 * grille parent qui l'intègre dans la sauvegarde atomique de toute la grille
 * (voir WorldHomeGridEditor.tsx).
 */
export function WorldHomeHtmlBlockEditor({
  open,
  onOpenChange,
  initialHtml,
  initialCss,
  initialTitle,
  initialCard = true,
  initialHeight,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialHtml?: string;
  initialCss?: string;
  initialTitle?: string;
  /** Défaut true — un bloc html a toujours été rendu en carte avant ce réglage. */
  initialCard?: boolean;
  /** Hauteur fixe en pixels ; absente, le bloc suit son contenu. */
  initialHeight?: number;
  /** Charge utile nommée plutôt que cinq positions muettes — même forme que
   *  `WorldHomeBannerDialog`. `height` absent signifie « hauteur automatique ». */
  onSave: (block: {
    html: string;
    css: string;
    title: string;
    card: boolean;
    height?: number;
  }) => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const [html, setHtml] = React.useState(initialHtml ?? "");
  const [css, setCss] = React.useState(initialCss ?? "");
  const [title, setTitle] = React.useState(initialTitle ?? "");
  const [card, setCard] = React.useState(initialCard);
  // Saisie gardée en texte : un champ vidé doit rester vide (« automatique »)
  // plutôt que de retomber sur un 0 que `number` imposerait.
  const [height, setHeight] = React.useState(initialHeight ? String(initialHeight) : "");

  React.useEffect(() => {
    if (open) {
      setHtml(initialHtml ?? "");
      setCss(initialCss ?? "");
      setTitle(initialTitle ?? "");
      setCard(initialCard);
      setHeight(initialHeight ? String(initialHeight) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialHtml, initialCss, initialTitle, initialHeight]);

  const htmlTooLong = html.length > MAX_HOME_BLOCK_CONTENT_LENGTH;
  const cssTooLong = css.length > MAX_HOME_BLOCK_CSS_LENGTH;
  const tooLong = htmlTooLong || cssTooLong;

  function handleSave() {
    if (tooLong || !html.trim()) return;
    // Même assainissement que la grille et le serveur : la saisie est bornée
    // ici aussi, pour que l'admin voie tout de suite ce qui sera enregistré.
    onSave({ html, css, title, card, height: sanitizeBlockHeight(Number(height.trim())) });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <SideSheetContent>
        <DrawerHeader className="border-b border-border-soft">
          <DrawerTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" /> {t("home.grid.htmlBlockTitle")}
          </DrawerTitle>
        </DrawerHeader>

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
            <label htmlFor="home-block-html-height" className="text-sm font-medium text-foreground">
              {t("home.grid.heightLabel")}
            </label>
            <Input
              id="home-block-html-height"
              type="number"
              inputMode="numeric"
              min={MIN_HOME_BLOCK_HEIGHT}
              max={MAX_HOME_BLOCK_HEIGHT}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder={t("home.grid.heightPlaceholder")}
            />
            <p className="text-xs leading-snug text-muted-foreground">{t("home.grid.heightHelp")}</p>
            <p className="text-xs text-muted-foreground">
              {t("home.grid.options.range", { min: MIN_HOME_BLOCK_HEIGHT, max: MAX_HOME_BLOCK_HEIGHT })}
            </p>
          </div>

          <Tabs defaultValue="html" className="gap-1.5">
            <TabsList>
              <TabsTrigger value="html">{t("home.grid.htmlLabel")}</TabsTrigger>
              <TabsTrigger value="css">{t("home.grid.cssLabel")}</TabsTrigger>
            </TabsList>

            <TabsContent value="html" className="space-y-1.5">
              <label htmlFor="home-block-html" className="sr-only">
                {t("home.grid.htmlLabel")}
              </label>
              <CodeEditor
                id="home-block-html"
                language="html"
                value={html}
                onChange={setHtml}
                placeholder={HTML_PLACEHOLDER}
                ariaInvalid={htmlTooLong}
              />
              <p className={cn("text-xs", htmlTooLong ? "text-destructive" : "text-muted-foreground")}>
                {htmlTooLong
                  ? t("home.announcement.htmlTooLong", { max: MAX_HOME_BLOCK_CONTENT_LENGTH })
                  : `${html.length} / ${MAX_HOME_BLOCK_CONTENT_LENGTH}`}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{t("home.grid.htmlHelp")}</p>
            </TabsContent>

            <TabsContent value="css" className="space-y-1.5">
              <label htmlFor="home-block-css" className="sr-only">
                {t("home.grid.cssLabel")}
              </label>
              <CodeEditor
                id="home-block-css"
                language="css"
                value={css}
                onChange={setCss}
                placeholder={CSS_PLACEHOLDER}
                ariaInvalid={cssTooLong}
              />
              <p className={cn("text-xs", cssTooLong ? "text-destructive" : "text-muted-foreground")}>
                {cssTooLong
                  ? t("home.announcement.htmlTooLong", { max: MAX_HOME_BLOCK_CSS_LENGTH })
                  : `${css.length} / ${MAX_HOME_BLOCK_CSS_LENGTH}`}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">{t("home.grid.cssHelp")}</p>
            </TabsContent>
          </Tabs>

          {html.trim() && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">{t("home.announcement.previewLabel")}</p>
              {/* Le composant de rendu public lui-même : l'aperçu montre le
                  balisage réellement retenu par la liste blanche, pas la
                  saisie brute. Un `<script>` collé ici disparaît sous les yeux
                  de l'admin, ce qui vaut toutes les explications. */}
              <WorldHomeHtmlBlockView id="preview" html={html} css={css} card={card} />
            </div>
          )}
        </div>

        <DrawerFooter className="flex-row justify-end gap-2 border-t border-border-soft">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={tooLong || !html.trim()}>
            {tCommon("save")}
          </Button>
        </DrawerFooter>
      </SideSheetContent>
    </Drawer>
  );
}
