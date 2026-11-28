"use client";

import { Fragment, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { ChevronDown } from "lucide-react";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import type {
  CalloutAlign,
  CalloutBlock,
  CalloutField,
  CalloutFont,
  CalloutIconKind,
  CalloutIconSize,
  CalloutSide,
  CalloutWidth,
  Gauge,
} from "@/lib/chat-blocks";
import {
  CALLOUT_BORDER_WIDTH_PX,
  CALLOUT_RADIUS_PX,
  CALLOUT_SIDES,
  resolveCalloutStyle,
  type ResolvedCalloutStyle,
} from "@/lib/calloutStyle";
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

/* ─── Classes des réglages ───────────────────────────────────────────────── */

const ICON_SIZE: Record<CalloutIconSize, { className: string; px: number }> = {
  small: { className: "h-4 w-4", px: 16 },
  medium: { className: "h-6 w-6", px: 24 },
  large: { className: "h-10 w-10", px: 40 },
};

const TITLE_FONT_CLASS: Record<CalloutFont, string> = {
  inherit: "",
  serif: "font-message-serif",
  mono: "font-mono",
  // Caveat est petite à taille égale : un cran au-dessus.
  hand: "font-message-hand text-lg leading-tight",
};

const WIDTH_CLASS: Record<CalloutWidth, string> = {
  full: "",
  medium: "max-w-xl",
  narrow: "max-w-sm",
};

/** Un encadré plus étroit que le fil se place selon l'alignement. */
const PLACEMENT_CLASS: Record<CalloutAlign, string> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
};

const TEXT_ALIGN_CLASS: Record<CalloutAlign, string> = {
  left: "",
  center: "items-center text-center",
  right: "items-end text-right",
};

const JUSTIFY_CLASS: Record<CalloutAlign, string> = {
  left: "",
  center: "justify-center",
  right: "justify-end",
};

const SIDE_WIDTH_PROP: Record<CalloutSide, "borderTopWidth" | "borderRightWidth" | "borderBottomWidth" | "borderLeftWidth"> = {
  top: "borderTopWidth",
  right: "borderRightWidth",
  bottom: "borderBottomWidth",
  left: "borderLeftWidth",
};

/** Un trait double ne se voit qu'à partir de 3 px. */
function borderPx(style: ResolvedCalloutStyle) {
  const px = CALLOUT_BORDER_WIDTH_PX[style.borderWidth];
  return style.borderStyle === "double" ? Math.max(px, 3) : px;
}

function CalloutFields({ fields, align }: { fields: CalloutField[]; align: CalloutAlign }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-left text-sm",
        align !== "left" && "w-fit max-w-full",
      )}
    >
      {fields.map((field, i) => (
        <Fragment key={i}>
          <dt className="font-medium text-muted-foreground">{field.key}</dt>
          <dd className="min-w-0 break-words text-foreground">{field.value}</dd>
        </Fragment>
      ))}
    </dl>
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
  const [expanded, setExpanded] = useState(false);
  const style = resolveCalloutStyle(block);
  const { align } = style;
  const fields = (block.fields ?? []).filter((f) => f.key?.trim() || f.value?.trim());
  const hasFields = fields.length > 0;
  const hasGauges = !!block.gauges && block.gauges.length > 0;
  const hasBody = !!block.text || hasFields || hasGauges;
  const collapsed = style.collapsible && hasBody && !expanded;

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

  const titleClass = cn(TITLE_FONT_CLASS[style.titleFont], style.titleSmallCaps && "[font-variant-caps:small-caps]");
  const titleStyle = style.titleColor ? { color: style.titleColor } : undefined;

  const toggle = style.collapsible && hasBody && (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        collapsed ? "mt-1" : "mt-2",
      )}
    >
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      {expanded ? t("callout.showLess") : t("callout.showMore")}
    </button>
  );

  /** Texte, champs puis jauges : ce que le repli cache. */
  const body = (afterHeader: boolean) => !collapsed && hasBody && (
    <>
      {block.text && (
        <CalloutMarkdown className={cn(afterHeader && "mt-1", style.bodyItalic && "italic", "w-full", TEXT_ALIGN_CLASS[align])}>
          {block.text}
        </CalloutMarkdown>
      )}
      {hasFields && (
        <div className={cn((afterHeader || block.text) && "mt-3")}>
          <CalloutFields fields={fields} align={align} />
        </div>
      )}
      {hasGauges && (
        <div className={cn("w-full space-y-2 text-left", (afterHeader || block.text || hasFields) && "mt-3")}>
          {renderGauges(block.gauges!, t("callout.gaugeDefault"))}
        </div>
      )}
    </>
  );

  const placement = cn(WIDTH_CLASS[style.width], style.width !== "full" && PLACEMENT_CLASS[align]);

  /* Style séparateur : titre centré entre deux filets, corps en dessous.
     Pas de marge à lui : GameBlockRenderer l'entoure déjà de son py-4.
     Les filets prennent l'épaisseur, le trait et la couleur de la bordure. */
  if (style.separator) {
    const lineStyle: React.CSSProperties = {
      borderTopWidth: borderPx(style),
      borderTopStyle: style.borderStyle,
      ...(style.borderColor && { borderTopColor: style.borderColor }),
    };
    return (
      <div className={cn("group/gblock relative w-full", placement)}>
        {toolbar("absolute -top-3 right-0 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-border" style={lineStyle} />
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest",
              !style.titleColor && "text-muted-foreground",
              titleClass,
            )}
            style={titleStyle}
          >
            {renderIcon(block.icon, block.iconKind, block.iconImage, block.accent, "h-3 w-3", 14, 12)}
            {block.title}
          </span>
          <div className="flex-1 border-t border-border" style={lineStyle} />
        </div>
        <div className={cn("flex flex-col", TEXT_ALIGN_CLASS[align])}>
          {!collapsed && hasBody && <div className={cn("mt-4 flex w-full flex-col", TEXT_ALIGN_CLASS[align])}>{body(false)}</div>}
          {toggle && <div className={cn(collapsed && "mt-2")}>{toggle}</div>}
        </div>
      </div>
    );
  }

  /* Styles « carte » : côtés, épaisseur, trait, arrondi et fond au choix.
     Sans couleur → fond transparent et bordure neutre. */
  const px = borderPx(style);
  const tinted = !!style.bgColor && style.bgIntensity > 0;
  const image = block.image || undefined;
  const surfaceStyle: React.CSSProperties = {
    borderStyle: style.borderStyle,
    borderRadius: CALLOUT_RADIUS_PX[style.radius],
    ...(style.borderColor && { borderColor: style.borderColor }),
    ...(tinted && { backgroundColor: `color-mix(in srgb, ${style.bgColor} ${style.bgIntensity}%, transparent)` }),
  };
  for (const side of CALLOUT_SIDES) {
    surfaceStyle[SIDE_WIDTH_PROP[side]] = style.sides.includes(side) ? px : 0;
  }
  // Sans bordure, sans fond ni image : le texte s'aligne sur celui des messages.
  const bare = style.sides.length === 0 && !tinted && !image;

  const iconSize = ICON_SIZE[style.iconSize];
  const icon = renderIcon(block.icon, block.iconKind, block.iconImage, style.titleColor, iconSize.className, iconSize.px + 2, iconSize.px);
  const inlineIcon = style.iconPosition === "inline" ? icon : null;
  const hasHeader = !!(inlineIcon || block.title);

  const content = (
    <div className={cn("flex min-w-0 flex-1 flex-col", TEXT_ALIGN_CLASS[align])}>
      {style.iconPosition === "top" && icon && <div className="mb-2 flex">{icon}</div>}
      {hasHeader && (
        <div className={cn("flex items-center gap-1.5", JUSTIFY_CLASS[align])}>
          {inlineIcon}
          {block.title && (
            <span className={cn("text-sm font-semibold", titleClass)} style={titleStyle}>
              {block.title}
            </span>
          )}
        </div>
      )}
      {body(hasHeader)}
      {toggle}
    </div>
  );

  return (
    <GameBlockSurface
      className={cn(
        "border-border",
        bare ? "bg-transparent px-0 py-1" : "p-4",
        !tinted && "bg-transparent",
        image && style.imageMode === "background" && "isolate",
        placement,
      )}
      style={surfaceStyle}
    >
      {image && style.imageMode === "background" && (
        // Enveloppe arrondie à part : la barre d'outils dépasse de la carte,
        // qui ne peut donc pas rogner ce qui déborde.
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
          <StoredImage url={image} width={1200} resize="cover" className="object-cover" />
          <span className="absolute inset-0 bg-background" style={{ opacity: style.imageVeil / 100 }} />
        </span>
      )}
      {toolbar("absolute -top-3 right-2 z-10 rounded-md bg-card/90 shadow-sm p-0.5")}
      {image && style.imageMode === "banner" && (
        <div className="relative -mx-4 -mt-4 mb-3 h-28 overflow-hidden rounded-t-[inherit]">
          <StoredImage url={image} width={1200} height={336} resize="cover" className="object-cover" />
          {style.imageVeil > 0 && (
            <span aria-hidden className="absolute inset-0 bg-background" style={{ opacity: style.imageVeil / 100 }} />
          )}
        </div>
      )}
      {style.iconPosition === "side" && icon ? (
        <div className="flex items-start gap-3">
          {icon}
          {content}
        </div>
      ) : content}
    </GameBlockSurface>
  );
}
