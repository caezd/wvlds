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
 * - Le confinement (`contain: layout paint`) fait de l'enveloppe le bloc
 *   conteneur de ses descendants positionnés : un `position: fixed` écrit dans
 *   le bloc se cale sur celui-ci au lieu de recouvrir l'application, et rien
 *   n'en déborde au dessin. C'est ce que l'iframe garantissait gratuitement.
 *
 *   Il est porté par une ENVELOPPE EXTÉRIEURE au `@scope`, et non par la racine
 *   du scope elle-même. La différence est tout sauf cosmétique : `:scope`
 *   désigne cette racine, la feuille du bloc est une feuille d'auteur injectée
 *   plus loin dans le document que la nôtre, et une déclaration `!important`
 *   y aurait donc raison de n'importe quelle règle de même spécificité —
 *   `!important` de notre côté ne ferait que déplacer la surenchère. Un
 *   ancêtre, lui, est hors de portée par construction : `@scope` ne fait
 *   correspondre que le sous-arbre de sa racine.
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

  // `ignoreInvalidStyle` : un attribut `style` malformé (`<div style="x">`)
  // fait autrement lever l'analyse pendant le rendu — soit la page d'accueil
  // en erreur pour tous les membres du monde, à cause d'un seul bloc.
  const content = useMemo(
    () => toJsxRuntime(tree, { Fragment, jsx, jsxs, ignoreInvalidStyle: true }),
    [tree],
  );

  return (
    <div
      className={cn(
        "wvlds-home-html-block",
        card && "rounded-lg border bg-background",
        height && "overflow-y-auto",
      )}
      style={height ? { height } : undefined}
    >
      <div className={scopeClass}>
        {scopedCss && <style dangerouslySetInnerHTML={{ __html: scopedCss }} />}
        {content}
      </div>
    </div>
  );
}
