"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { highlightCode, type CodeLanguage } from "@/lib/codeHighlighter";

/**
 * Champ de saisie de code coloré syntaxiquement.
 *
 * Technique classique de la zone de texte superposée : un `<pre>` coloré au
 * fond, un `<textarea>` transparent par-dessus qui garde le curseur, la
 * sélection, l'annulation, la saisie mobile et l'accessibilité natifs. Écrire
 * un vrai éditeur (contenteditable + gestion du caret) coûterait tout cela
 * pour le seul gain de colorer pendant la frappe plutôt qu'après.
 *
 * Les deux couches doivent se superposer au pixel près : même police, même
 * corps, même interligne, même remplissage, même politique de retour à la
 * ligne. C'est la seule contrainte de ce composant, d'où les classes
 * dupliquées ci-dessous plutôt qu'une classe partagée qu'un futur ajustement
 * n'appliquerait qu'à une des deux.
 */
export function CodeEditor({
  id,
  value,
  onChange,
  language,
  placeholder,
  ariaInvalid,
  rows = 12,
  fill = false,
  textareaRef,
  onKeyDown,
  ariaLabel,
  className,
  layerClassName,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  ariaInvalid?: boolean;
  /** Hauteur du champ, en lignes — comme l'attribut `rows` d'un `<textarea>`. */
  rows?: number;
  /** Occupe la hauteur offerte par le parent au lieu de la fixer sur `rows`. */
  fill?: boolean;
  /**
   * Donne accès au champ de saisie.
   *
   * Nécessaire à qui écrit dans le texte à la place de l'utilisateur — une
   * ceinture d'outils de mise en forme lit la sélection puis la repose.
   */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  ariaLabel?: string;
  className?: string;
  /**
   * Ajouté aux DEUX couches — jamais à une seule.
   *
   * Elles doivent se superposer au pixel près (voir l'en-tête de ce fichier) :
   * un remplissage posé sur la zone de saisie et pas sur la couche colorée
   * décalerait le texte de l'une par rapport à l'autre. Sert à aligner le champ
   * sur le reste d'une page, comme dans l'éditeur d'article du wiki.
   */
  layerClassName?: string;
}) {
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    let annulé = false;
    void (async () => {
      try {
        const html = await highlightCode(value, language);
        if (annulé) return;
        setHighlighted(html);
      } catch {
        // Coloration indisponible (chargement du fragment en échec hors
        // ligne, grammaire refusée) : la couche de repli affiche le code tel
        // quel. Un champ lisible et éditable vaut mieux qu'un champ vide.
        if (!annulé) setHighlighted(null);
      }
    })();
    return () => { annulé = true; };
  }, [value, language]);

  // Le `<pre>` ne défile pas de lui-même (il n'a pas le focus) : on lui
  // recopie la position de défilement de la zone de saisie.
  function syncScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = event.currentTarget.scrollTop;
    pre.scrollLeft = event.currentTarget.scrollLeft;
  }

  const layer = cn(
    "absolute inset-0 m-0 overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed",
    "whitespace-pre-wrap break-words",
    layerClassName,
  );

  return (
    <div
      className={cn(
        "relative rounded-md border bg-transparent",
        fill && "h-full",
        ariaInvalid && "border-destructive",
        className,
      )}
      style={fill ? undefined : { height: `calc(${rows} * 1.625 * 0.75rem + 1.5rem)` }}
    >
      {highlighted ? (
        <div
          ref={preRef as unknown as React.Ref<HTMLDivElement>}
          aria-hidden
          // Contenu produit par Shiki à partir du code saisi, qu'il échappe
          // lui-même — ce n'est pas du balisage fourni par l'utilisateur. Son
          // fond est déjà transparent (voir highlightCode) : c'est celui du
          // tiroir qui reste visible.
          className={cn(layer, "pointer-events-none [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words")}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre ref={preRef} aria-hidden className={cn(layer, "pointer-events-none text-foreground")}>
          {value}
        </pre>
      )}
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        aria-invalid={ariaInvalid}
        className={cn(
          layer,
          "resize-none border-0 bg-transparent text-transparent caret-foreground outline-none",
          "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
          "selection:bg-primary/30 selection:text-transparent",
        )}
      />
    </div>
  );
}
