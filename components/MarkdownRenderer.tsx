"use client";

import React, { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

import { cn } from "@/lib/utils";
import { transformStyledSpans, createFenceTracker } from "@/lib/textStyledSpans";
import { highlightLexiconTerms } from "@/lib/lexiconHighlight";
import { extractHeadings } from "@/lib/wikiToc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { StoredImage } from "@/components/ui/stored-image";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import type { LinkPreview } from "@/lib/wikiLinkPreview";
import type { WorldLexiconTerm } from "@/types/worlds";

type Props = {
  content: string;
  className?: string;
  /** Taille prose Tailwind. Défaut: "sm". Passer "base" ou "lg" pour agrandir. */
  proseSize?: "sm" | "base" | "lg" | "xl";
  /** autoriser les images inline ![alt](url) ? par défaut: false */
  allowImages?: boolean;
  isMine?: boolean;
  /** Gère les liens internes `[texte](wiki:slug)` (voir lib/wikiLinks.ts) — si
   *  absent, ces liens sont rendus visuellement cassés plutôt que cliquables
   *  (contexte hors wiki, ex: un `wiki:` tapé à la main dans un message). */
  onWikiLink?: (slug: string, anchor?: string) => void;
  /** Lexique du monde (voir lib/lexiconHighlight.ts) — absent = pas de
   *  surlignage. Réservé aux pages du wiki, jamais aux messages de chat. */
  lexiconTerms?: WorldLexiconTerm[];
  /** Ce qu'il y a à montrer d'une page visée, au survol de son lien — voir
   *  `lib/wikiApercu.ts`. Absent, ou rendant `null`, le lien reste nu. */
  wikiPreview?: (slug: string) => LinkPreview | null;
  /** Ouvre l'image en grand. Absent, elle reste une simple illustration. */
  onImageOpen?: (url: string) => void;
};

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode })?.children);
  return "";
}

function CodeBlock({ className, children, ...props }: React.ComponentProps<"code">) {
  const tCommon = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const isBlock = /language-/.test(className ?? "");

  if (!isBlock) {
    return (
      <code className="rounded px-1 py-0.5 bg-muted" {...props}>
        {children}
      </code>
    );
  }

  const lang = (className ?? "").replace("language-", "").trim();
  const txt = extractText(children).replace(/\n$/, "");

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { }
  };

  return (
    <div className="inline-flex relative group not-prose">
      <button
        type="button"
        onClick={doCopy}
        className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-xs absolute right-2 top-2 rounded-md border bg-background/80 px-2 py-1"
        aria-label={tCommon("copyCode")}
        // Le libellé bascule « Copier » → « Copié » au clic. Sans cette
        // marque, il compterait dans le texte de la page et décalerait d'un
        // caractère toutes les annotations situées plus bas (voir
        // lib/domTextOffsets.ts).
        data-annotate-ignore
      >
        {copied ? tCommon("copied") : tCommon("copy")}
      </button>
      <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3">
        <code className={className} {...props} data-lang={lang}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// Format hex valide en CSS (3/4/6/8 chiffres) — partagé entre `urlTransform`
// et le composant `a` ci-dessous pour que les deux n'acceptent jamais que le
// même format, sans dupliquer (et risquer de faire diverger) la regex.
const COLOR_HEX_RE = /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// react-markdown assainit lui-même les URLs (indépendamment de rehype-sanitize)
// via une liste figée de protocoles (http/https/mailto/tel) — sans ça, nos
// faux hrefs `color:`/`underline:` (voir lib/textStyledSpans.ts) seraient
// vidés avant même d'atteindre le composant `a`. On ne laisse passer que la
// forme exacte attendue (`color:` + hex valide, ou `underline:` seul) :
// un `[texte](underline:foo)` tapé à la main ne doit pas produire un vrai
// lien avec un href arbitraire.
function urlTransform(url: string): string {
  if (url.startsWith("color:") && COLOR_HEX_RE.test(url.slice("color:".length))) return url;
  if (url === "underline:") return url;
  if (url.startsWith("wiki:")) return url;
  if (url.startsWith("lexicon:")) return url;
  return defaultUrlTransform(url);
}

/**
 * Transforme << ... >> en blockquote markdown, même au milieu d’un paragraphe.
 * Comme un <div> ne peut pas être au milieu d'un <p>, on force une séparation par paragraphes.
 *
 * - Ignore les fenced code blocks (``` / ~~~)
 * - Ignore l'inline code (`...`)
 */
export function transformAngleCallouts(input: string): string {
  const src = (input ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");

  const fenceTracker = createFenceTracker();

  const out: string[] = [];

  // état callout/inline code (persistant entre lignes hors fence)
  let inInlineCode = false;
  let inlineTicks = 0;

  let inCallout = false;
  let calloutBuf = "";

  const pushCalloutBlock = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const blockLines = trimmed.split("\n");
    if (out.length && out[out.length - 1].trim() !== "") out.push("");

    for (const l of blockLines) {
      out.push(l.trim() === "" ? ">" : `> ${l}`);
    }
    out.push("");
  };

  const processTextLine = (line: string) => {
    let i = 0;
    let acc = "";

    while (i < line.length) {
      const ch = line[i];

      // inline code : gestion des runs de backticks
      if (!inCallout && ch === "`") {
        let j = i;
        while (j < line.length && line[j] === "`") j++;
        const runLen = j - i;

        if (!inInlineCode) {
          inInlineCode = true;
          inlineTicks = runLen;
          acc += line.slice(i, j);
          i = j;
          continue;
        } else {
          // on ne ferme que si la longueur correspond
          if (runLen === inlineTicks) {
            inInlineCode = false;
            inlineTicks = 0;
          }
          acc += line.slice(i, j);
          i = j;
          continue;
        }
      }

      // callout start: <<
      if (!inInlineCode && !inCallout && ch === "<" && line[i + 1] === "<") {
        // on ferme le paragraphe courant
        const before = acc.trimEnd();
        if (before.length) out.push(before);
        else if (out.length && out[out.length - 1] !== "") out.push("");

        // séparation de paragraphe
        if (out.length && out[out.length - 1].trim() !== "") out.push("");
        // ouvre le callout
        inCallout = true;
        calloutBuf = "";
        acc = "";
        i += 2;
        continue;
      }

      // callout end: >>
      if (!inInlineCode && inCallout && ch === ">" && line[i + 1] === ">") {
        pushCalloutBlock(calloutBuf);
        inCallout = false;
        calloutBuf = "";
        i += 2;

        // si le reste de la ligne a du contenu, on continuera dans acc (nouveau paragraphe)
        continue;
      }

      if (inCallout) {
        calloutBuf += ch;
      } else {
        acc += ch;
      }

      i += 1;
    }

    if (inCallout) {
      // on conserve le retour ligne à l’intérieur du callout multi-lignes
      calloutBuf += "\n";
      // on ne pousse rien dans out: le callout n’est pas fermé
    } else {
      // ligne normale
      out.push(acc);
    }
  };

  for (const line of lines) {
    if (fenceTracker.consume(line)) {
      out.push(line);
      continue;
    }

    // hors fence: appliquer la transformation
    processTextLine(line);
  }

  // si callout non fermé, on le laisse tel quel (pas de transformation)
  if (inCallout) {
    // on recompose grossièrement: on ajoute les marqueurs et le contenu brut
    // (ça évite de “perdre” le texte)
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    out.push(`<<${calloutBuf}`);
  }

  return out.join("\n");
}

/**
 * Rendu markdown brut, sans le wrapper `div.prose` — à utiliser quand
 * plusieurs segments doivent partager un seul `div.prose` parent
 * (ex: ChatroomMessageBubble, qui mélange prose et bulles non-prose).
 */
export function MarkdownContent({
  content,
  allowImages = false,
  isMine = false,
  onWikiLink,
  lexiconTerms,
  wikiPreview,
  onImageOpen,
}: Pick<Props, "content" | "allowImages" | "isMine" | "onWikiLink" | "lexiconTerms" | "wikiPreview" | "onImageOpen">) {
  const schema = useMemo(() => {
    return {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
        code: [
          ...(defaultSchema.attributes?.code ?? []),
          ["className", /^language-[\w-]+$/],
        ],
      },
      // Le schéma par défaut ne whitelist que les protocoles usuels (http,
      // https, mailto…) pour `href`. Nécessaire en plus de `urlTransform`
      // ci-dessous (react-markdown a son propre filtre d'URL, indépendant
      // de rehype-sanitize) pour laisser passer `color:`/`underline:`
      // (voir lib/textStyledSpans.ts) à travers les deux filtres.
      protocols: {
        ...defaultSchema.protocols,
        href: [...(defaultSchema.protocols?.href ?? []), "color", "underline", "wiki", "lexicon"],
      },
    } as Parameters<typeof rehypeSanitize>[0];
  }, []);

  const normalized = useMemo(() => {
    const withLexicon = lexiconTerms?.length
      ? highlightLexiconTerms(content, lexiconTerms)
      : content;
    return transformAngleCallouts(transformStyledSpans(withLexicon));
  }, [content, lexiconTerms]);

  // Ids d'ancre posés sur les titres (h1-h6), pour le sommaire du wiki
  // (lib/wikiToc.ts::extractHeadings, appelé côté appelant sur ce même
  // `content` brut — même algorithme de slug, consommé ici par position dans
  // le document plutôt que par texte : les transforms ci-dessus (callouts,
  // spans stylés) ne changent jamais le nombre ni l'ordre des lignes de
  // titre, seulement leur contenu inline).
  const headingsRef = useRef(extractHeadings(content));
  headingsRef.current = useMemo(() => extractHeadings(content), [content]);
  const headingIndexRef = useRef(0);
  headingIndexRef.current = 0;

  const lexiconById = useMemo(() => {
    const map = new Map<string, WorldLexiconTerm>();
    for (const t of lexiconTerms ?? []) map.set(t.id, t);
    return map;
  }, [lexiconTerms]);

  function headingComponent(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
    return function Heading({ children }: { children?: React.ReactNode }) {
      const heading = headingsRef.current[headingIndexRef.current];
      headingIndexRef.current += 1;
      return <Tag id={heading?.id}>{children}</Tag>;
    };
  }

  const components: Components = {
    h1: headingComponent("h1"),
    h2: headingComponent("h2"),
    h3: headingComponent("h3"),
    h4: headingComponent("h4"),
    h5: headingComponent("h5"),
    h6: headingComponent("h6"),
    // Tous les blockquotes sont rendus comme "callout" (div)
    blockquote({ children }) {
      return (
        <div
          className={cn(
            "not-prose rounded-lg border px-3 py-2",
            "text-sm leading-relaxed text-foreground",
            "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
            "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 bg-background",
            isMine ? "rounded-tr-xs" : "rounded-tl-xs",
          )}
        >
          {children}
        </div>
      );
    },

    code: CodeBlock,

    img({ src, alt }) {
      if (allowImages) {
        const image = (
          // URL arbitraire saisie par l'utilisateur dans le markdown — domaine inconnu,
          // ne peut pas passer par l'optimiseur next/image (remotePatterns fermé par design)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={String(src)}
            alt={String(alt ?? "")}
            loading="lazy"
            className="max-w-full rounded-md border"
          />
        );
        if (!onImageOpen) return image;
        return (
          // Un bouton et non un `onClick` posé sur l'image : la visionneuse
          // doit s'ouvrir au clavier comme au clic, et une image seule n'est
          // pas atteignable à la tabulation.
          <button
            type="button"
            onClick={() => onImageOpen(String(src))}
            className="block cursor-zoom-in"
          >
            {image}
          </button>
        );
      }
      return (
        <a
          href={String(src)}
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
        >
          [image]
        </a>
      );
    },

    a({ href, children }) {
      // Faux liens produits par transformStyledSpans (`[#ff0000]texte[/]` / `++texte++`) —
      // voir lib/textStyledSpans.ts. Un lien `color:`/`underline:` tapé directement
      // par l'utilisateur est traité de la même façon : c'est le même contrat.
      const hrefStr = String(href ?? "");
      if (hrefStr.startsWith("color:")) {
        const hex = hrefStr.slice("color:".length);
        if (COLOR_HEX_RE.test(hex)) {
          // prose force sa propre couleur sur `strong`/`code` (--tw-prose-bold /
          // --tw-prose-code), ce qui écraserait sinon la couleur héritée de ce
          // span pour un `**gras**` ou un `` `code` `` imbriqué à l'intérieur.
          return (
            <span
              style={{ color: `#${hex}` }}
              className="[&_strong]:text-inherit [&_code]:text-inherit"
            >
              {children}
            </span>
          );
        }
        return <>{children}</>;
      }
      if (hrefStr.startsWith("underline:")) {
        if (hrefStr === "underline:") return <span className="underline">{children}</span>;
        return <>{children}</>;
      }
      if (hrefStr.startsWith("lexicon:")) {
        const termId = hrefStr.slice("lexicon:".length);
        const term = lexiconById.get(termId);
        // Terme supprimé depuis le rendu du texte source : reste du texte simple.
        if (!term) return <>{children}</>;
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-sm px-0.5 underline decoration-dotted decoration-primary/60 underline-offset-2 hover:bg-primary/10"
              >
                {children}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm">
              <p className="font-semibold text-foreground">{term.term}</p>
              <p className="mt-1 text-muted-foreground">{term.description}</p>
            </PopoverContent>
          </Popover>
        );
      }
      if (hrefStr.startsWith("wiki:")) {
        // `wiki:slug#section` vise une section ; `wiki:#section` reste dans la
        // page courante, où il n'y a rien à charger avant de défiler.
        const cible = hrefStr.slice("wiki:".length);
        const diese = cible.indexOf("#");
        const slug = diese === -1 ? cible : cible.slice(0, diese);
        const anchor = diese === -1 ? "" : cible.slice(diese + 1);

        if ((!slug && !anchor) || !onWikiLink) {
          return (
            <span className="cursor-not-allowed text-destructive underline decoration-dashed decoration-destructive/60">
              {children}
            </span>
          );
        }
        const lien = (
          <button
            type="button"
            onClick={() => onWikiLink(slug, anchor || undefined)}
            className="underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            {children}
          </button>
        );

        const apercu = wikiPreview?.(slug) ?? null;
        // Rien à montrer : le lien reste nu. Une carte qui n'apprendrait que
        // le titre déjà écrit dans le lien vaut moins que pas de carte.
        if (!apercu) return lien;

        return (
          <HoverCard openDelay={400} closeDelay={100}>
            <HoverCardTrigger asChild>{lien}</HoverCardTrigger>
            {/* `not-prose` : la carte vit dans un article, dont les règles
                typographiques donneraient à ses paragraphes les marges d'un
                corps de texte. */}
            <HoverCardContent className="not-prose w-72 overflow-hidden p-0">
              {apercu.bannerUrl && (
                <div className="relative h-24 w-full bg-secondary">
                  <StoredImage
                    url={apercu.bannerUrl}
                    width={864}
                    height={288}
                    resize="cover"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {apercu.icon && VALID_LUCIDE_ICONS.has(apercu.icon) && (
                    <LazyLucideIcon name={apercu.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{apercu.title}</span>
                </p>
                {apercu.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {apercu.description}
                  </p>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      }
      return (
        <a
          href={hrefStr}
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:opacity-80"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <ReactMarkdown
      skipHtml
      urlTransform={urlTransform}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[
        [
          rehypeExternalLinks,
          { target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] },
        ],
        // `rehypeHighlight` retiré : il posait des classes `hljs-*` que le
        // `rehypeSanitize` ci-dessous supprimait aussitôt (le schéma n'autorise
        // `className` sur `code` que pour `/^language-[\w-]+$/`, et aucune sur
        // `span`). Aucune coloration n'atteignait donc l'écran — et aucune CSS
        // du projet ne définit `hljs-*` — mais il embarquait ~35 grammaires
        // (lowlight) dans le chunk de chaque message et fragmentait le code en
        // spans vides. Voir MarkdownRenderer.codeBlocks.test.tsx.
        [rehypeSanitize, schema],
      ]}
      components={components}
    >
      {normalized}
    </ReactMarkdown>
  );
}

export function proseClassName(
  proseSize: NonNullable<Props["proseSize"]> = "sm",
  className?: string,
) {
  return cn(
    "prose dark:prose-invert max-w-none",
    proseSize === "sm" && "prose-sm",
    proseSize === "lg" && "prose-lg",
    proseSize === "xl" && "prose-xl",
    "prose-sm sm:prose-base",
    "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
    className,
  );
}

export default function MarkdownRenderer({
  content,
  className,
  proseSize = "sm",
  allowImages = false,
  isMine = false,
  onWikiLink,
  lexiconTerms,
  wikiPreview,
  onImageOpen,
}: Props) {
  return (
    <div className={proseClassName(proseSize, className)}>
      <MarkdownContent
        content={content}
        allowImages={allowImages}
        isMine={isMine}
        onWikiLink={onWikiLink}
        lexiconTerms={lexiconTerms}
        wikiPreview={wikiPreview}
        onImageOpen={onImageOpen}
      />
    </div>
  );
}
