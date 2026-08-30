"use client";

import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { cn } from "@/lib/utils";
import { blockScopeClass, prepareHomeHtmlBlock } from "./homeHtmlBlock";

/**
 * Rendu d'un bloc HTML libre de la page d'accueil, directement dans la page
 * (l'iframe d'origine a été retirée : elle imposait une hauteur devinée, un
 * fond opaque, et coupait le bloc de la typographie du site).
 *
 * Ce qui remplace le bac à sable du navigateur est décrit en détail dans
 * homeHtmlBlock.ts. Deux points tiennent au rendu lui-même :
 *
 * - Le HTML n'est JAMAIS injecté en chaîne. `toJsxRuntime` construit des
 *   éléments React depuis l'arbre assaini : une valeur d'attribut reste une
 *   valeur d'attribut, elle ne peut pas devenir un gestionnaire d'événement.
 *   `dangerouslySetInnerHTML` n'apparaît que pour la balise `<style>`, dont le
 *   contenu est du CSS — inerte — et dont la seule évasion possible (`</`) est
 *   neutralisée en amont.
 * - `contain: layout` fait de l'hôte le bloc conteneur de ses descendants
 *   positionnés : un `position: fixed` écrit dans le bloc se cale sur le bloc
 *   au lieu de recouvrir l'application. C'est ce que l'iframe garantissait
 *   gratuitement, et que le seul cloisonnement des sélecteurs ne donne pas.
 */
export function WorldHomeHtmlBlockView({
  id,
  html,
  css,
  card = true,
  height,
}: {
  /** Id du bloc dans la grille — sert de racine au `@scope` de sa feuille. */
  id: string;
  html: string;
  css?: string;
  card?: boolean;
  /** Hauteur fixe en pixels ; absente, le bloc suit son contenu. */
  height?: number;
}) {
  const scopeClass = blockScopeClass(id);
  const { tree, css: scopedCss } = useMemo(
    () => prepareHomeHtmlBlock({ html, css, scopeClass }),
    [html, css, scopeClass],
  );

  const content = useMemo(() => toJsxRuntime(tree, { Fragment, jsx, jsxs }), [tree]);

  return (
    <div
      className={cn(
        scopeClass,
        card && "rounded-lg border bg-background",
        height && "overflow-y-auto",
      )}
      style={{ contain: "layout", ...(height ? { height } : {}) }}
    >
      {scopedCss && <style dangerouslySetInnerHTML={{ __html: scopedCss }} />}
      {content}
    </div>
  );
}
