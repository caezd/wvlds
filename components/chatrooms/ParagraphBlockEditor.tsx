"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";

function buildHTML(v: string): string {
  if (!v) return `<div data-block><br></div>`;
  return v
    .split(/\n\n+/)
    .map((p) => {
      const escaped = p
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      return `<div data-block>${escaped || "<br>"}</div>`;
    })
    .join("");
}

function normalizeBlocks(el: HTMLDivElement) {
  // 1. Donne data-block aux divs directs qui en manquent (créés par le browser)
  Array.from(el.children).forEach((child) => {
    if (child.tagName === "DIV" && !child.hasAttribute("data-block")) {
      child.setAttribute("data-block", "");
    }
  });

  // 2. Si le browser a tout aplati (plus aucun div enfant avec data-block),
  //    on enveloppe le contenu restant dans un nouveau bloc.
  const hasBlocks = el.querySelector(":scope > [data-block]");
  if (!hasBlocks) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-block", "");
    // Déplace tous les nœuds enfants dans le wrapper
    while (el.firstChild) wrapper.appendChild(el.firstChild);
    if (!wrapper.childNodes.length) wrapper.appendChild(document.createElement("br"));
    el.appendChild(wrapper);
  }
}

function extractValue(el: HTMLDivElement): string {
  const blocks = Array.from(
    el.querySelectorAll<HTMLElement>(":scope > [data-block]"),
  );
  return blocks
    .map((b) => {
      const t = b.innerText ?? "";
      return t.endsWith("\n") ? t.slice(0, -1) : t;
    })
    .join("\n\n");
}

export function ParagraphBlockEditor({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  wrapperClassName,
  submitOnEnter = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  /** Classes CSS supplémentaires appliquées au div wrapper (remplace max-h-40 si besoin). */
  wrapperClassName?: string;
  /** Si vrai (défaut), Entrée seule déclenche onKeyDown (envoi). Si faux,
      Entrée crée des sauts de ligne / nouveaux blocs (mode document). */
  submitOnEnter?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Initialisation une seule fois au montage
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = buildHTML(value);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync depuis l'extérieur uniquement si le DOM ne correspond pas déjà
  // (ex: vidage après envoi). Compare avec ce qui est dans le DOM pour
  // éviter de réinitialiser pendant que l'utilisateur tape.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = extractValue(el);
    if (value === current) return;
    el.innerHTML = buildHTML(value);
    if (!value) {
      // Réinitialise la sélection pour éviter les références dangling vers les
      // anciens nœuds supprimés (texte qui s'insère en dehors du composer).
      if (document.activeElement === el) {
        const firstBlock = el.querySelector("[data-block]");
        const range = document.createRange();
        range.setStart(firstBlock ?? el, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [value]);

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Toujours intercepter : empêche le browser de coller du HTML riche (spans, styles…)
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    // Essaie d'abord de détecter les paragraphes depuis le HTML (copie depuis message rendu)
    let paragraphs: string[] = [];
    const html = e.clipboardData.getData("text/html");
    if (html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;

      // innerText ignore les <br> sur éléments détachés — traverser manuellement
      function nodeText(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
        if (node instanceof HTMLElement && node.tagName === "BR") return "\n";
        let out = "";
        node.childNodes.forEach((c) => { out += nodeText(c); });
        return out;
      }

      const blocks = Array.from(tmp.querySelectorAll("p, li"));
      if (blocks.length > 1) {
        paragraphs = blocks.map((b) => nodeText(b).trim()).filter(Boolean);
      }
    }

    // Fallback : double saut de ligne dans le texte brut
    if (paragraphs.length <= 1) {
      paragraphs = text.split(/\n\n+/);
    }

    function paraToHTML(para: string): string {
      return para.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") || "<br>";
    }

    const el = editorRef.current;
    if (!el) return;

    // Un seul paragraphe : insertion inline au curseur, sans HTML riche
    if (paragraphs.length <= 1) {
      document.execCommand("insertHTML", false, paraToHTML(paragraphs[0] ?? text));
      handleInput();
      return;
    }

    // Plusieurs paragraphes : insertion bloc par bloc
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Trouve le bloc courant pour y insérer le premier paragraphe
    let node: Node | null = range.startContainer;
    let currentBlock: HTMLElement | null = null;
    while (node && node !== el) {
      if (node instanceof HTMLElement && node.hasAttribute("data-block")) {
        currentBlock = node; break;
      }
      node = node.parentElement;
    }

    // Supprime la sélection existante
    range.deleteContents();

    const [first, ...rest] = paragraphs;
    if (currentBlock) {
      // Vide le bloc courant et y place le premier paragraphe
      range.selectNodeContents(currentBlock);
      range.deleteContents();
      currentBlock.innerHTML = paraToHTML(first);

      // Insère les paragraphes suivants comme nouveaux blocs après le bloc courant
      let anchor: HTMLElement = currentBlock;
      for (const para of rest) {
        const newBlock = document.createElement("div");
        newBlock.setAttribute("data-block", "");
        newBlock.innerHTML = paraToHTML(para);
        anchor.insertAdjacentElement("afterend", newBlock);
        anchor = newBlock;
      }

      // Place le curseur à la fin du dernier bloc inséré
      const lastBlock = anchor;
      const newRange = document.createRange();
      newRange.selectNodeContents(lastBlock);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    handleInput();
  }

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    normalizeBlocks(el);

    // Après normalisation, le curseur peut pointer sur `el` lui-même (ex: Ctrl+A + Suppr).
    // Si c'est le cas, on le replace au début du premier bloc.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.getRangeAt(0).startContainer;
      let insideBlock = false;
      while (node && node !== el) {
        if (node instanceof HTMLElement && node.hasAttribute("data-block")) {
          insideBlock = true;
          break;
        }
        node = node.parentElement;
      }
      if (!insideBlock) {
        const firstBlock = el.querySelector<HTMLElement>("[data-block]");
        if (firstBlock) {
          const r = document.createRange();
          r.setStart(firstBlock, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
    }

    onChange(extractValue(el));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") { onKeyDown?.(e); return; }

    const shift = e.shiftKey;
    const ctrl  = e.ctrlKey;

    // Enter seul → envoi (mode composer uniquement)
    if (submitOnEnter && !shift && !ctrl) {
      e.preventDefault();
      onKeyDown?.(e);
      return;
    }

    // Shift+Enter ou Ctrl+Enter → retour de ligne OU nouveau bloc
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const el = editorRef.current;
    if (!el) return;

    // Trouve le bloc courant
    let node: Node | null = range.startContainer;
    let block: HTMLElement | null = null;
    while (node && node !== el) {
      if (node instanceof HTMLElement && node.hasAttribute("data-block")) {
        block = node; break;
      }
      node = node.parentElement;
    }
    if (!block) return;

    // Nœud juste avant le curseur
    const prevNode =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startOffset === 0
          ? range.startContainer.previousSibling
          : null
        : range.startOffset > 0
          ? (range.startContainer as Element).childNodes[range.startOffset - 1]
          : range.startContainer.previousSibling;

    if (prevNode?.nodeName === "BR") {
      // Deuxième retour consécutif → nouveau bloc paragraphe
      e.preventDefault();
      block.removeChild(prevNode);

      const newBlock = document.createElement("div");
      newBlock.setAttribute("data-block", "");
      newBlock.innerHTML = "<br>";
      block.insertAdjacentElement("afterend", newBlock);

      const newRange = document.createRange();
      newRange.setStart(newBlock, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      handleInput();
    }
    // Sinon : premier retour → laisse le browser insérer un <br> nativement
  }

  return (
    <div className={cn("relative max-h-40 overflow-y-auto [scrollbar-width:thin]", focused && "pb-editor", wrapperClassName)}>
      {!value.trim() && !focused && placeholder && (
        <span className="absolute top-[5px] left-[10px] pointer-events-none select-none text-muted-foreground/50 text-sm">
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "outline-none w-full text-sm",
          className,
        )}
      />
    </div>
  );
}
