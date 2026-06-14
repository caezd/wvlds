"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/lib/utils";

type Props = {
  content: string;
  className?: string;
  /** Taille prose Tailwind. Défaut: "sm". Passer "base" ou "lg" pour agrandir. */
  proseSize?: "sm" | "base" | "lg" | "xl";
  /** autoriser les images inline ![alt](url) ? par défaut: false */
  allowImages?: boolean;
  isMine?: boolean;
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
    } catch {}
  };

  return (
    <div className="inline-flex relative group not-prose">
      <button
        type="button"
        onClick={doCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs absolute right-2 top-2 rounded-md border bg-background/80 px-2 py-1"
        aria-label="Copier le code"
      >
        {copied ? "Copié" : "Copier"}
      </button>
      <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3">
        <code className={className} {...props} data-lang={lang}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function isFenceLine(line: string) {
  // ex: ```ts, ~~~, ``` etc.
  const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  const fence = m[2];
  return { char: fence[0], len: fence.length };
}

/**
 * Transforme << ... >> en blockquote markdown, même au milieu d’un paragraphe.
 * Comme un <div> ne peut pas être au milieu d'un <p>, on force une séparation par paragraphes.
 *
 * - Ignore les fenced code blocks (``` / ~~~)
 * - Ignore l'inline code (`...`)
 */
function transformAngleCallouts(input: string): string {
  const src = (input ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");

  let inFence = false;
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;

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
    const fence = isFenceLine(line);

    if (!inFence && fence) {
      inFence = true;
      fenceChar = fence.char as "`" | "~";
      fenceLen = fence.len;
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      if (fence && fence.char === fenceChar && fence.len >= fenceLen) {
        inFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
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

export default function MarkdownRenderer({
  content,
  className,
  proseSize = "sm",
  allowImages = false,
  isMine = false,
}: Props) {
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
    } as Parameters<typeof rehypeSanitize>[0];
  }, []);

  const normalized = useMemo(() => transformAngleCallouts(content), [content]);

  const components: Components = {
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
        return (
          <img
            src={String(src)}
            alt={String(alt ?? "")}
            loading="lazy"
            className="max-w-full rounded-md border"
          />
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
      return (
        <a
          href={String(href)}
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
    <div
      className={cn(
        "prose dark:prose-invert max-w-none grid gap-4",
        proseSize === "sm" && "prose-sm",
        proseSize === "lg" && "prose-lg",
        proseSize === "xl" && "prose-xl",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[
          [
            rehypeExternalLinks,
            { target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] },
          ],
          rehypeHighlight,
          [rehypeSanitize, schema],
        ]}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
