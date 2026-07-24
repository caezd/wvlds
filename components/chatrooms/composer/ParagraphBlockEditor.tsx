"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Bold, Italic, Strikethrough, Underline, List, Palette, Heading, Heading1, Heading2, Heading3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { wrapSelection, applyListPrefix, applyHeadingPrefix } from "@/lib/textFormatting";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";
import { BUBBLE_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

function textToInsertableHTML(text: string): string {
  return (
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>") || "<br>"
  );
}

/** Remonte de `node` vers son `[data-block]` (paragraphe) englobant, dans les limites de `el`. */
function findBlock(el: HTMLDivElement, node: Node | null): HTMLElement | null {
  while (node && node !== el) {
    if (node instanceof HTMLElement && node.hasAttribute("data-block")) return node;
    node = node.parentElement;
  }
  return null;
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

const NBSP_RE = new RegExp(String.fromCharCode(160), "g");

function extractValue(el: HTMLDivElement): string {
  const blocks = Array.from(
    el.querySelectorAll<HTMLElement>(":scope > [data-block]"),
  );
  return blocks
    .map((b) => {
      // Le navigateur substitue parfois une espace insecable a une espace
      // normale en bord de contenu (ex: juste apres "## " insere via
      // execCommand("insertHTML", ...)) pour eviter qu'elle ne soit collapsee
      // visuellement. Ce caractere passe pour une espace normale cote JS,
      // mais remark/CommonMark exige une espace ASCII stricte apres les #
      // d'un titre ATX -- sans cette normalisation, un titre tape via la
      // barre de mise en forme resterait un paragraphe.
      const t = (b.innerText ?? "").replace(NBSP_RE, " ");
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
  invertEnter = false,
  formatting = false,
  autoFocus = false,
  disabled = false,
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
  /** Si vrai, inverse le rôle d'Entrée : Entrée seule crée un saut de ligne /
      nouveau bloc, Maj+Entrée ou Ctrl+Entrée envoie. Utilisé sur mobile où
      Maj+Entrée n'est pas accessible sur un clavier virtuel. */
  invertEnter?: boolean;
  /** Affiche une barre de mise en forme (gras/italique/…) au-dessus de la
   *  zone de saisie tant qu'elle est active. Désactivé par défaut : les
   *  autres usages de ce composant (WorldMap, WorldWiki) restent inchangés. */
  formatting?: boolean;
  /** Focus l'éditeur au montage, curseur placé à la fin du contenu. */
  autoFocus?: boolean;
  /** Désactive la saisie (ex: pendant une sauvegarde en cours). */
  disabled?: boolean;
}) {
  const t = useTranslations("chatrooms");
  const editorRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState(BUBBLE_COLOR_PRESETS[4].value);
  // Sélection sauvegardée avant l'ouverture du picker de couleur — la
  // sélection dans le contentEditable ne survit pas aux clics dans le popover
  // (portalé ailleurs dans le DOM), donc on la restaure au moment d'appliquer.
  const savedRangeRef = useRef<Range | null>(null);
  // Position de la barre flottante, calculée depuis la sélection courante —
  // null = pas de sélection (donc pas de barre). Contrairement à `focused`,
  // ne se base pas sur le focus de l'éditeur : la barre n'apparaît que
  // lorsque du texte est réellement sélectionné (façon Discord/Notion).
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

  // Met à jour (ou efface) la position de la barre flottante à partir de la
  // sélection courante. Ignoré tant qu'un popover/dropdown de la barre est
  // ouvert : la sélection réelle a pu être perdue au profit du popover
  // (portalé ailleurs), mais la barre doit rester ancrée là où elle était.
  function updateSelectionRect() {
    if (!formatting || colorPickerOpen || headingMenuOpen) return;
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelectionRect(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      setSelectionRect(null);
      return;
    }
    // Range.getBoundingClientRect() n'existe pas sous jsdom (pas de layout
    // réel) — un rect à zéro suffit à rendre la sélection "truthy" pour les
    // tests, la position exacte n'y a pas d'importance.
    setSelectionRect(
      typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
    );
  }

  useEffect(() => {
    if (!formatting) return;
    document.addEventListener("selectionchange", updateSelectionRect);
    return () => document.removeEventListener("selectionchange", updateSelectionRect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatting, colorPickerOpen, headingMenuOpen]);

  // Initialisation une seule fois au montage
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = buildHTML(value);
    if (autoFocus) {
      el.focus();
      // el.focus() ne déclenche pas toujours de façon fiable l'événement
      // "focus" natif remonté par React (selon le navigateur/l'état du
      // document) — sans ça, `focused` resterait faux (placeholder qui
      // réapparaît, `pb-editor` non appliqué) tant que l'utilisateur n'a
      // pas recliqué.
      setFocused(true);
      // Cibler le dernier [data-block] plutôt que `el` : `selectNodeContents(el)`
      // + `collapse(false)` positionne le curseur après le dernier enfant de
      // `el` (donc au niveau de `el`, pas à l'intérieur du bloc) — la première
      // lettre tapée s'insère alors comme nœud texte hors paragraphe.
      const blocks = el.querySelectorAll<HTMLElement>("[data-block]");
      const lastBlock = blocks[blocks.length - 1] ?? el;
      const range = document.createRange();
      range.selectNodeContents(lastBlock);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
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
    // Même précaution qu'à l'initialisation (cf. plus haut) : cibler le
    // dernier bloc, pas `el`, pour ne pas placer le curseur hors paragraphe.
    const blocks = el.querySelectorAll<HTMLElement>("[data-block]");
    const lastBlock = blocks[blocks.length - 1] ?? el;
    const range = document.createRange();
    range.selectNodeContents(lastBlock);
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

  // Coupe `block` au curseur : le contenu après le curseur va dans un nouveau bloc en dessous.
  function splitBlockAtCursor(block: HTMLElement, range: Range, sel: Selection) {
    const xr = document.createRange();
    xr.setStart(range.startContainer, range.startOffset);
    if (block.lastChild) xr.setEndAfter(block.lastChild);
    const fragment = xr.extractContents();
    // Retire les <br> parasites en début du fragment
    while (fragment.firstChild?.nodeName === "BR") fragment.removeChild(fragment.firstChild);
    // Bloc original : s'assurer qu'il a au moins un <br>
    if (!block.childNodes.length) block.appendChild(document.createElement("br"));

    const newBlock = document.createElement("div");
    newBlock.setAttribute("data-block", "");
    newBlock.appendChild(fragment.childNodes.length ? fragment : document.createElement("br"));
    block.insertAdjacentElement("afterend", newBlock);

    const nr = document.createRange();
    nr.setStart(newBlock, 0);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") { onKeyDown?.(e); return; }

    const shift = e.shiftKey;
    const ctrl  = e.ctrlKey;
    const modifierHeld = shift || ctrl;

    // Touche qui déclenche l'envoi : Entrée seule normalement, ou Maj/Ctrl+Entrée
    // en mode inversé (mobile — Maj+Entrée n'y est pas accessible facilement).
    const triggersSubmit = invertEnter ? modifierHeld : !modifierHeld;

    if (submitOnEnter && triggersSubmit) {
      e.preventDefault();
      onKeyDown?.(e);
      return;
    }

    // Sinon → retour de ligne OU nouveau bloc
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
      // Deuxième retour consécutif → couper le bloc au curseur :
      // le texte après le curseur est poussé dans un nouveau bloc en dessous.
      e.preventDefault();
      block.removeChild(prevNode);
      splitBlockAtCursor(block, sel.getRangeAt(0), sel);
      handleInput();
    }
    // Sinon : premier retour → laisse le browser insérer un <br> nativement
  }

  // ── Mise en forme ────────────────────────────────────────────────────────

  /** Entoure la sélection courante (ou insère une paire vide) de `before`/`after`. */
  function applyWrap(before: string, after: string) {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    // Une sélection qui traverse plusieurs paragraphes ne peut pas être
    // enveloppée en toute sécurité : `range.toString()` ne pose aucun
    // séparateur aux frontières de bloc/`<br>`, donc le texte obtenu serait
    // aplati (deux paragraphes concaténés sans saut de ligne) — et
    // `execCommand("insertHTML", …)` remplacerait ensuite cette même plage
    // multi-blocs par un unique blob HTML, cassant potentiellement la
    // structure en `[data-block]` distincts.
    if (findBlock(el, range.startContainer) !== findBlock(el, range.endContainer)) return;

    // `range.toString()` plutôt que `sel.toString()` : c'est ce même `range`
    // qu'`execCommand("insertHTML", …)` remplace juste après, donc les deux
    // doivent porter exactement sur le même texte.
    const selectedText = range.toString();
    const result = wrapSelection(selectedText, 0, selectedText.length, before, after);

    el.focus();
    document.execCommand("insertHTML", false, textToInsertableHTML(result.text));

    // Replace le curseur à la position calculée par wrapSelection (au milieu
    // des marqueurs quand rien n'était sélectionné) — insertHTML place le
    // curseur à la toute fin de ce qui vient d'être inséré par défaut.
    const stepBack = result.text.length - result.cursorStart;
    const after2 = window.getSelection();
    // Selection.modify() est non-standard mais largement supportée par les
    // navigateurs (Chromium/WebKit/Gecko) ; absente dans certains environnements
    // (ex. jsdom en test) — dans ce cas on accepte que le curseur reste en fin
    // de texte plutôt que de faire échouer l'insertion.
    if (stepBack > 0 && typeof after2?.modify === "function") {
      for (let i = 0; i < stepBack; i++) after2.modify("move", "backward", "character");
    }

    handleInput();
  }

  /** Préfixe le bloc (paragraphe) courant en liste, comme applyListPrefix. */
  function applyList() {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const block = findBlock(el, range.startContainer);
    if (!block) return;

    const blockText = block.innerText.endsWith("\n") ? block.innerText.slice(0, -1) : block.innerText;
    const preRange = document.createRange();
    preRange.setStart(block, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const localOffset = preRange.toString().length;

    const result = applyListPrefix(blockText, localOffset, localOffset);

    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);
    sel.removeAllRanges();
    sel.addRange(blockRange);
    el.focus();
    document.execCommand("insertHTML", false, textToInsertableHTML(result.text));
    handleInput();
  }

  /** Transforme tout le paragraphe (bloc) contenant le curseur en titre markdown, quelle que soit sa position dedans. */
  function applyHeading(level: number) {
    restoreSelection();
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const block = findBlock(el, range.startContainer);
    if (!block) return;

    const blockText = block.innerText.endsWith("\n") ? block.innerText.slice(0, -1) : block.innerText;
    const result = applyHeadingPrefix(blockText, level);

    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);
    sel.removeAllRanges();
    sel.addRange(blockRange);
    el.focus();
    document.execCommand("insertHTML", false, textToInsertableHTML(result.text));
    handleInput();
    setHeadingMenuOpen(false);
  }

  /** Sauvegarde la sélection avant qu'un clic hors de l'éditeur (ex: popover) ne la perde. */
  function saveSelection() {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
  }

  function restoreSelection() {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function applyColor(hex: string) {
    restoreSelection();
    applyWrap(`[#${hex.replace("#", "")}]`, "[/]");
    setColorPickerOpen(false);
  }

  const toolbarButtonClass = "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  // Barre flottante ancrée au-dessus (ou en dessous, si pas assez de place)
  // de la sélection — façon Discord/Notion. `position: fixed` : les
  // coordonnées de `getBoundingClientRect()` sont déjà relatives au viewport,
  // et ça évite tout clip par l'`overflow-y-auto` du wrapper si la sélection
  // est proche d'un bord pendant que l'éditeur est scrollé.
  //
  // Portalée dans document.body (plus bas) : un ancêtre avec `transform`
  // (ex. DialogContent, centré via translate-x/y-[-50%]) redéfinirait le
  // containing block d'un `position: fixed` descendant — les coordonnées
  // viewport de getBoundingClientRect() ne correspondraient alors plus à la
  // position réelle de la barre (composeur de création en dialog).
  const TOOLBAR_HEIGHT = 40;
  const TOOLBAR_GAP = 8;
  const toolbarStyle: React.CSSProperties | undefined = selectionRect
    ? {
        top:
          selectionRect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP >= 0
            ? selectionRect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP
            : selectionRect.bottom + TOOLBAR_GAP,
        left: Math.min(
          Math.max(selectionRect.left + selectionRect.width / 2, 140),
          window.innerWidth - 140,
        ),
        transform: "translateX(-50%)",
      }
    : undefined;

  return (
    <div
      className={cn(
        "relative overflow-y-auto [scrollbar-width:thin] max-h-40",
        focused && "pb-editor",
        wrapperClassName,
      )}
    >
      {formatting && selectionRect && createPortal(
        <div
          style={toolbarStyle}
          className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-border-soft bg-background p-1 shadow-lg"
        >
          <DropdownMenu open={headingMenuOpen} onOpenChange={setHeadingMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t("formatHeading")}
                aria-label={t("formatHeading")}
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                className={toolbarButtonClass}
              >
                <Heading className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => applyHeading(1)}>
                <Heading1 className="h-3.5 w-3.5" />
                {t("formatHeading1")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyHeading(2)}>
                <Heading2 className="h-3.5 w-3.5" />
                {t("formatHeading2")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => applyHeading(3)}>
                <Heading3 className="h-3.5 w-3.5" />
                {t("formatHeading3")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            title={t("formatBold")}
            aria-label={t("formatBold")}
            onMouseDown={(e) => { e.preventDefault(); applyWrap("**", "**"); }}
            className={toolbarButtonClass}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("formatItalic")}
            aria-label={t("formatItalic")}
            onMouseDown={(e) => { e.preventDefault(); applyWrap("*", "*"); }}
            className={toolbarButtonClass}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("formatStrikethrough")}
            aria-label={t("formatStrikethrough")}
            onMouseDown={(e) => { e.preventDefault(); applyWrap("~~", "~~"); }}
            className={toolbarButtonClass}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("formatUnderline")}
            aria-label={t("formatUnderline")}
            onMouseDown={(e) => { e.preventDefault(); applyWrap("++", "++"); }}
            className={toolbarButtonClass}
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("formatList")}
            aria-label={t("formatList")}
            onMouseDown={(e) => { e.preventDefault(); applyList(); }}
            className={toolbarButtonClass}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t("formatColor")}
                aria-label={t("formatColor")}
                // Ne pas appeler setColorPickerOpen(true) ici : PopoverTrigger
                // gère déjà l'ouverture via son propre onClick (Radix), qui se
                // déclenche juste après ce mousedown. L'appeler nous-mêmes en
                // plus créerait un double-toggle (ouvert par le mousedown,
                // refermé par le onClick de Radix qui inverse l'état courant).
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                className={toolbarButtonClass}
              >
                <Palette className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
              <div className="space-y-3">
                <HsvColorPicker color={pendingColor} onChange={setPendingColor} />
                <button
                  type="button"
                  onClick={() => applyColor(pendingColor)}
                  className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/85 transition-colors"
                >
                  {t("colorConfirm")}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>,
        document.body,
      )}
      {!value.trim() && placeholder && (
        <span className="absolute top-[5px] left-[10px] pointer-events-none select-none text-muted-foreground/50 text-sm">
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={updateSelectionRect}
        onMouseUp={updateSelectionRect}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // Un clic dans le popover couleur / dropdown titre déclenche aussi
          // ce blur (focus volé par Radix) — ne pas y cacher la barre.
          if (!colorPickerOpen && !headingMenuOpen) setSelectionRect(null);
        }}
        className={cn(
          "outline-none w-full text-sm",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      />
    </div>
  );
}
