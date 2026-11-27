"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import type { CalloutBlock, CalloutBorder, CalloutAlign, CalloutIconKind, Gauge } from "@/lib/chat-blocks";
import { VALID_LUCIDE_ICONS as VALID_ICON_SET } from "@/lib/lucideIconNames";
import { cn } from "@/lib/utils";
import { StoredImage } from "@/components/ui/stored-image";
import { ReactionEmoji } from "@/components/chatrooms/reactions/ReactionEmoji";
import { GameBlockSurface, GameBlockToolbar, GameBlockEditButton } from "./GameBlockShell";

// La fenêtre d'édition (sélecteur d'icônes, catalogue, couleurs…) se charge à
// l'ouverture : elle n'a rien à faire dans le JavaScript de chaque salon. Son
// bouton déclencheur s'affiche aussitôt (`loading`), le temps qu'elle arrive.
const CalloutDialog = dynamic(() => import("./CalloutDialog").then((m) => m.CalloutDialog), {
  ssr: false,
  loading: () => <GameBlockEditButton />,
});

/* ─── Helpers de rendu ───────────────────────────────────────────────────── */

function renderIcon(
  icon: string | undefined,
  iconKind: CalloutIconKind | undefined,
  iconImage: string | undefined,
  accent: string | undefined,
  size = "h-4 w-4",
  emojiPx = 18,
  sizePx = 16,
) {
  if (iconKind === "image") {
    if (!iconImage) return null;
    return (
      // Enveloppée : `StoredImage` remplit son parent, qui doit donc porter
      // la taille et être positionné.
      <span className={cn(size, "relative shrink-0 overflow-hidden rounded-sm")}>
        <StoredImage
          url={iconImage}
          width={sizePx * 4}
          height={sizePx * 4}
          resize="cover"
          className="object-cover"
        />
      </span>
    );
  }
  if (!icon) return null;
  if (iconKind === "lucide") {
    if (!VALID_ICON_SET.has(icon)) return null;
    return (
      <LazyLucideIcon
        name={icon}
        className={cn(size, "shrink-0", !accent && "text-muted-foreground")}
        style={accent ? { color: accent } : undefined}
      />
    );
  }
  // emoji → rendu Twitter (cohérent avec les réactions)
  return (
    <span className="shrink-0 leading-none">
      <ReactionEmoji value={icon} size={emojiPx} />
    </span>
  );
}

function renderGauges(gauges: Gauge[], gaugeDefault: string) {
  return (
    <>
      {gauges.map((gauge, i) => {
        const pct = gauge.max > 0
          ? Math.min(100, Math.max(0, Math.round((gauge.current / gauge.max) * 100)))
          : 0;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{gauge.name || gaugeDefault}</span>
              <span className="font-mono text-muted-foreground">{gauge.current}/{gauge.max}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: gauge.color }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ─── Rendu Markdown ────────────────────────────────────────────────────── */

/**
 * Paragraphes espacés comme ceux d'un message (`gap-3`, cf.
 * ChatroomMessageBubble) : le texte se saisit avec le même éditeur que le
 * composeur, il doit se lire de la même façon.
 */
function CalloutMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed text-foreground", className)}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 italic opacity-70">{children}</blockquote>,
          a: ({ href, children }) => {
            const safe = href && /^https?:\/\//i.test(href) ? href : href?.startsWith("/") ? href : "#";
            return <a href={safe} className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          h1: ({ children }) => <p className="font-bold">{children}</p>,
          h2: ({ children }) => <p className="font-bold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* ─── Vue ────────────────────────────────────────────────────────────────── */

export function CalloutBlockView({
  block,
  mine,
  onEdit,
  onDelete,
  onUploadIconImage,
}: {
  block: CalloutBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onUploadIconImage?: (file: File) => Promise<string | null>;
}) {
  const t = useTranslations("chatrooms");
  const accent = block.accent;
  const hasAccent = !!accent;
  const border: CalloutBorder = block.border ?? "full";
  const align: CalloutAlign = block.align ?? "left";
  const rounded = block.rounded !== false;
  const hasGauges = !!block.gauges && block.gauges.length > 0;

  const toolbar = (className?: string) => (
    <GameBlockToolbar
      mine={mine}
      className={className}
      editDialog={
        onEdit && (
          <CalloutDialog
            initialBlock={block}
            onSend={onEdit}
            trigger={<GameBlockEditButton />}
            onUploadIconImage={onUploadIconImage}
          />
        )
      }
      onDelete={onDelete}
      deleteDescription="L'encadré sera supprimé définitivement."
    />
  );

  /* Style séparateur : titre centré entre deux filets, corps en dessous.
     Pas de marge à lui : GameBlockRenderer l'entoure déjà de son py-4. */
  if (border === "separator") {
    return (
      <div className="group/gblock relative w-full">
        {toolbar("absolute -top-3 right-0 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest",
              !hasAccent && "text-muted-foreground",
            )}
            style={hasAccent ? { color: accent } : undefined}
          >
            {renderIcon(block.icon, block.iconKind, block.iconImage, accent, "h-3 w-3", 14, 12)}
            {block.title}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {block.text && (
          <CalloutMarkdown className={cn("mt-4", align === "center" && "text-center")}>
            {block.text}
          </CalloutMarkdown>
        )}
        {hasGauges && (
          <div className={cn("space-y-2", (block.text) && "mt-3")}>
            {renderGauges(block.gauges!, t("callout.gaugeDefault"))}
          </div>
        )}
      </div>
    );
  }

  /* Styles « carte » : full / left / none.
     Sans accent → fond transparent + bordure neutre (classes par défaut). */
  const surfaceStyle: React.CSSProperties = !hasAccent
    ? {}
    : border === "full"
      ? {
        backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
      }
      : border === "left"
        ? {
          backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
          borderLeftColor: accent,
        }
        : {};

  const surfaceClass = cn(
    !hasAccent && "bg-transparent",
    // L'épaisseur vient d'ici ; `surfaceStyle` ne fait que la teinter.
    border === "full" && "border",
    border === "left" && "border-l-4",
    border === "none" && "border-0 bg-transparent px-0 py-1",
    !rounded && "rounded-none",
    "p-4"
  );

  const hasHeader = !!(block.icon || block.title || (block.iconKind === "image" && block.iconImage));

  return (
    <GameBlockSurface className={surfaceClass} style={surfaceStyle}>
      {toolbar("absolute -top-3 right-2 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
      <div className={cn(align === "center" && "flex flex-col items-center text-center")}>
        {hasHeader && (
          <div className={cn("flex items-center gap-1.5", align === "center" && "justify-center")}>
            {renderIcon(block.icon, block.iconKind, block.iconImage, accent)}
            {block.title && (
              <span className="text-sm font-semibold" style={hasAccent ? { color: accent } : undefined}>
                {block.title}
              </span>
            )}
          </div>
        )}
        {block.text && (
          <CalloutMarkdown className={cn(hasHeader && "mt-1")}>
            {block.text}
          </CalloutMarkdown>
        )}
        {hasGauges && (
          <div className={cn("w-full space-y-2", (hasHeader || block.text) && "mt-3")}>
            {renderGauges(block.gauges!, t("callout.gaugeDefault"))}
          </div>
        )}
      </div>
    </GameBlockSurface>
  );
}
