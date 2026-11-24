"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, CornerUpLeft, Hash, Maximize2, MessageSquareText, MessagesSquare, Minimize2, PanelBottom, PanelRight, Reply, SendHorizontal, Trash2, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useLiveChatContext, type LiveChatRoom } from "@/lib/worldLiveChatStore";
import {
  setLiveChatFullscreen,
  setLiveChatOpen,
  setLiveChatPlacement,
  setLiveChatSize,
  useLiveChatLayout,
  type LiveChatPlacement,
} from "@/lib/liveChatLayout";
import { useWorldLiveChat, type LiveChatMessage, type SendExtras } from "@/hooks/useWorldLiveChat";
import { useLiveChannels } from "@/hooks/useLiveChannels";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { MAIN_PLACE, placeKey, type LiveChannel, type LiveChatPlace } from "@/lib/worldLiveChannels";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { useLiveChatOptions } from "@/hooks/useLiveChatOptions";
import { usePersonaTints } from "@/hooks/usePersonaTints";
import { parseLiveChatInput, type LiveChatOptions } from "@/lib/worldLiveChatOptions";
import { BUBBLE_MAX_ALPHA, bubbleStyle, readableOnPage } from "@/lib/bubbleColors";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";
import { HsvColorPicker, normalizeHexColor } from "@/components/ui/hsv-color-picker";
import { liveChatPlainText, parseLiveChatMarkdown, type LiveChatSpan } from "@/lib/liveChatMarkdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import type { Persona } from "@/types/db";

const MAX_LENGTH = DB_TEXT_LIMITS["world_live_messages.content"];
/** Distance au bas (px) en deçà de laquelle un nouveau message fait défiler. */
const STICK_THRESHOLD = 80;

/**
 * Chat en direct du monde courant, au bas de l'application.
 *
 * Replié : une barre fine qui fait défiler le dernier message et son auteur,
 * avec le nombre de membres présents. Déplié : un panneau de la moitié de la
 * hauteur de l'écran ; le contenu de la page, au-dessus, se resserre.
 *
 * Des salles (migration 238) : la principale, celles du monde (nom, couleur,
 * icône), et, dans un salon de jeu, le fil de ce salon, qui s'ouvre de
 * lui-même. Un clic sur un message y répond.
 *
 * Monté par `AppShell` ; ne rend rien hors d'un monde (aucun
 * `WorldLiveChatAnchor` monté) ou si le drapeau `world_live_chat` est éteint.
 */
export function WorldLiveChatDock() {
  const { world_live_chat } = useFeatureFlags();
  const context = useLiveChatContext();
  if (!world_live_chat || !context) return null;
  return <Dock worldId={context.worldId} chatroom={context.chatroom} />;
}

/**
 * Pour `AppShell` : la chatbox ouverte à droite de la page (sur grand écran),
 * ou en plein écran à sa place. Rien de tout cela quand le dock ne s'affiche
 * pas (hors d'un monde, drapeau éteint), quel que soit le dernier choix.
 */
export function useLiveChatDockLayout(): { side: boolean; fullscreen: boolean } {
  const { world_live_chat } = useFeatureFlags();
  const context = useLiveChatContext();
  const layout = useLiveChatLayout();
  const shown = !!world_live_chat && !!context && layout.open;
  return { side: shown && layout.placement === "side", fullscreen: shown && layout.fullscreen };
}

/** L'endroit à afficher : la salle choisie, tant qu'elle existe encore. */
function usePlace(chatroom: LiveChatRoom | null, channels: LiveChannel[] | null) {
  const chatroomId = chatroom?.id ?? null;
  const [place, setPlace] = useState<LiveChatPlace>(() => (chatroomId ? { kind: "chatroom", id: chatroomId } : MAIN_PLACE));
  // Entrer dans un salon ouvre son fil ; en sortir ramène à la principale
  // si l'on y était.
  const [prevRoom, setPrevRoom] = useState(chatroomId);
  if (prevRoom !== chatroomId) {
    setPrevRoom(chatroomId);
    setPlace((p) => (chatroomId ? { kind: "chatroom", id: chatroomId } : p.kind === "chatroom" ? MAIN_PLACE : p));
  }
  // Une salle supprimée pendant qu'on la lit : retour à la principale.
  const gone = place.kind === "channel" && channels !== null && !channels.some((c) => c.id === place.id);
  return [gone ? MAIN_PLACE : place, setPlace] as const;
}

function Dock({ worldId, chatroom }: { worldId: string; chatroom: LiveChatRoom | null }) {
  const t = useTranslations("worldLiveChat");
  const { channels } = useLiveChannels(worldId);
  const [place, setPlace] = usePlace(chatroom, channels);
  const { messages, loading, presentCount, send, remove, userId, unread, hasOlder, loadingOlder, loadOlder } =
    useWorldLiveChat(worldId, place);
  const options = useLiveChatOptions(worldId);
  // Couleur de groupe des personas, lue seulement si le monde les permet.
  const tints = usePersonaTints(worldId, options.personas);
  // Ouverte ou fermée, en bas ou à droite : le dernier choix (lib/liveChatLayout).
  const { open, placement, fullscreen, height, width } = useLiveChatLayout();
  const panelRef = useRef<HTMLElement>(null);
  const setOpen = setLiveChatOpen;
  const [replyTo, setReplyTo] = useState<LiveChatMessage | null>(null);
  const last = messages[messages.length - 1] ?? null;
  const key = placeKey(place);

  // La réponse en cours ne survit pas à un changement de salle.
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setReplyTo(null);
  }

  const places = buildPlaces(channels ?? [], chatroom);
  const current = places.find((p) => placeKey(p.place) === key) ?? places[0];
  // Un fil de salon d'un autre salon ne compte pas : seul celui-ci est en vue.
  const unreadHere = (k: string) => unread.has(k) && (!k.startsWith("r:") || k === `r:${chatroom?.id}`);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={t("open")}
        data-testid="world-live-chat-bar"
        className="flex h-8 w-full shrink-0 items-center gap-2 overflow-hidden border-t bg-background px-3 text-left text-xs transition-colors hover:bg-muted lg:mt-2 lg:rounded-lg lg:border"
      >
        <MessagesSquare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {current && <PlaceLabel entry={current} className="max-w-32 shrink-0" />}
        {places.some((p) => placeKey(p.place) !== key && unreadHere(placeKey(p.place))) && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label={t("newActivity")} data-testid="world-live-chat-activity" />
        )}
        <span className="relative min-w-0 flex-1 overflow-hidden">
          {last ? (
            // La clé rejoue l'animation d'entrée à chaque nouveau message.
            <span key={last.id} className="flex min-w-0 items-baseline gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <span className="shrink-0 font-semibold text-foreground">{last.author?.username ?? "…"}</span>
              <span className="truncate text-muted-foreground">{liveChatPlainText(last.content)}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{t("title")}</span>
          )}
        </span>
        <PresentCount count={presentCount} />
      </button>
    );
  }

  return (
    <>
      {/* Hors plein écran, l'espace entre la page et le chat est sa poignée. */}
      {!fullscreen && <ResizeHandle panel={panelRef} placement={placement} height={height} width={width} />}
      <section
        aria-label={t("title")}
        data-testid="world-live-chat-panel"
        data-placement={placement}
        data-fullscreen={fullscreen || undefined}
        ref={panelRef}
        // La taille réglée à la poignée ; sans elle, celle des classes.
        style={{
          "--live-chat-height": height ? `${height}px` : undefined,
          "--live-chat-width": width ? `${width}px` : undefined,
        } as React.CSSProperties}
        className={cn(
          "relative flex w-full shrink-0 flex-col overflow-hidden border-t bg-background lg:rounded-lg lg:border",
          // Plein écran : la place de la page. À droite : une colonne à côté
          // d'elle sur grand écran, en bas sinon (AppShell range les deux).
          fullscreen
            ? "min-h-0 flex-1"
            : placement === "side"
              ? "h-[var(--live-chat-height,50dvh)] max-h-[85dvh] lg:h-auto lg:max-h-none lg:w-[var(--live-chat-width,24rem)] lg:max-w-[60vw]"
              : "h-[var(--live-chat-height,50dvh)] max-h-[85dvh]",
        )}
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
          <MessagesSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="sr-only">{t("title")}</h2>
          {/* Les salles : la principale, celles du monde, le fil du salon. */}
          <div role="tablist" aria-label={t("channels")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" data-testid="world-live-chat-places">
            {places.map((entry) => {
              const k = placeKey(entry.place);
              const selected = k === key;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPlace(entry.place)}
                  data-place={k}
                  className={cn(
                    "relative flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs transition-colors",
                    selected ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <PlaceLabel entry={entry} className="max-w-40" />
                  {!selected && unreadHere(k) && (
                    <span className="size-1.5 rounded-full bg-primary" aria-label={t("newActivity")} data-testid="world-live-chat-unread" />
                  )}
                </button>
              );
            })}
          </div>
          <PresentCount count={presentCount} />
          <div className="ml-auto flex shrink-0 items-center">
            {!fullscreen && (
              // À droite seulement sur grand écran : en dessous, la colonne n'aurait pas la place.
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden lg:inline-flex"
                onClick={() => setLiveChatPlacement(placement === "side" ? "bottom" : "side")}
                aria-label={placement === "side" ? t("dockBottom") : t("dockRight")}
                title={placement === "side" ? t("dockBottom") : t("dockRight")}
              >
                {placement === "side" ? <PanelBottom /> : <PanelRight />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setLiveChatFullscreen(!fullscreen)}
              aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
              title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
          >
            <ChevronDown />
          </Button>
        </header>
        {/* Changer de salle remonte la liste et le champ (défilement, brouillon).
            Clés distinctes : ce sont deux enfants du même parent. */}
        <MessageList
          key={`list-${key}`}
          messages={messages}
          loading={loading}
          hasOlder={hasOlder}
          loadingOlder={loadingOlder}
          onLoadOlder={async () => {
            const read = await loadOlder();
            if (read === null) toast.error(t("loadOlderFailed"));
            return read ?? 0;
          }}
          selfId={userId}
          options={options}
          tints={tints}
          onReply={setReplyTo}
          onDelete={async (id) => {
            if (!(await remove(id))) toast.error(t("deleteFailed"));
            if (replyTo?.id === id) setReplyTo(null);
          }}
        />
        <Composer
          key={`composer-${key}`}
          worldId={worldId}
          userId={userId}
          options={options}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={async (text, extras) => {
            // `/me …` : une action jouée, si le monde les permet (migration 241).
            const { content, isAction } = parseLiveChatInput(text, options.actions);
            const res = await send(content, replyTo?.id ?? null, { ...extras, isAction });
            if (res === "too_fast") toast.error(t("tooFast"));
            else if (res === "persona") toast.error(t("personaRejected"));
            else if (res === "error") toast.error(t("sendFailed"));
            if (res === "ok") setReplyTo(null);
            return res === "ok";
          }}
          onEscape={() => setOpen(false)}
        />
      </section>
    </>
  );
}

/** Le pas d'une flèche du clavier sur la poignée, en pixels. */
const RESIZE_STEP = 32;

/** Les bornes de la chatbox : assez grande pour lire, assez petite pour laisser la page. */
function clampSize(size: number, side: boolean) {
  const max = side ? window.innerWidth * 0.6 : window.innerHeight * 0.85;
  return Math.round(Math.min(Math.max(size, side ? 280 : 160), Math.max(max, side ? 280 : 160)));
}

/**
 * La poignée entre la page et la chatbox : l'espace qui les sépare, sans
 * trait visible ; seul le curseur l'annonce au survol. Glisser (ou les
 * flèches du clavier) règle la hauteur du chat en bas, sa largeur à droite.
 * La taille se retient à la fin du glisser (lib/liveChatLayout).
 */
function ResizeHandle({
  panel,
  placement,
  height,
  width,
}: {
  panel: React.RefObject<HTMLElement | null>;
  placement: LiveChatPlacement;
  height: number | null;
  width: number | null;
}) {
  const t = useTranslations("worldLiveChat");
  const side = placement === "side";
  const drag = useRef<{ from: number; size: number } | null>(null);
  // La taille réglée, sinon celle qu'affiche le panneau.
  const current = () => {
    const box = panel.current?.getBoundingClientRect();
    return (side ? width ?? box?.width : height ?? box?.height) ?? 0;
  };
  const resize = (size: number, persist: boolean) =>
    setLiveChatSize(side ? { width: clampSize(size, true) } : { height: clampSize(size, false) }, persist);
  const value = side ? width : height;
  return (
    <div
      role="separator"
      aria-orientation={side ? "vertical" : "horizontal"}
      aria-label={t("resize")}
      aria-valuenow={value ?? undefined}
      tabIndex={0}
      data-testid="world-live-chat-resize"
      className={cn(
        // Le contour au clavier seulement : à la souris, le curseur suffit.
        "shrink-0 touch-none rounded-full focus-visible:bg-primary/40 focus-visible:outline-none",
        side
          ? // Sur grand écran seulement (en dessous, le chat est en bas).
            "hidden w-2 cursor-col-resize lg:block"
          : // Sur mobile, pas d'espace : la poignée chevauche le haut du chat.
            "relative z-10 -mb-1.5 h-1.5 cursor-row-resize lg:mb-0 lg:h-2",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { from: side ? e.clientX : e.clientY, size: current() };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        // Le chat grandit vers la page : vers le haut en bas, vers la gauche à droite.
        resize(drag.current.size + drag.current.from - (side ? e.clientX : e.clientY), false);
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        resize(current(), true);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => {
        const grow = side ? e.key === "ArrowLeft" : e.key === "ArrowUp";
        const shrink = side ? e.key === "ArrowRight" : e.key === "ArrowDown";
        if (!grow && !shrink) return;
        e.preventDefault();
        resize(current() + (grow ? RESIZE_STEP : -RESIZE_STEP), true);
      }}
    />
  );
}

function PresentCount({ count }: { count: number }) {
  const t = useTranslations("worldLiveChat");
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums" data-testid="world-live-chat-present">
      <Users className="size-3.5" aria-hidden />
      {t("present", { count })}
    </span>
  );
}

type PlaceEntry =
  | { place: LiveChatPlace; kind: "main" }
  | { place: LiveChatPlace; kind: "channel"; channel: LiveChannel }
  | { place: LiveChatPlace; kind: "chatroom"; title: string };

/** Les onglets : la principale, les salles du monde, puis le fil du salon. */
export function buildPlaces(channels: LiveChannel[], chatroom: LiveChatRoom | null): PlaceEntry[] {
  return [
    { place: MAIN_PLACE, kind: "main" },
    ...channels.map((channel) => ({ place: { kind: "channel" as const, id: channel.id }, kind: "channel" as const, channel })),
    ...(chatroom ? [{ place: { kind: "chatroom" as const, id: chatroom.id }, kind: "chatroom" as const, title: chatroom.title }] : []),
  ];
}

/** L'icône (« # » par défaut) et le nom d'une salle, à sa couleur. */
function PlaceLabel({ entry, className }: { entry: PlaceEntry; className?: string }) {
  const t = useTranslations("worldLiveChat");
  if (entry.kind === "chatroom") {
    return (
      <span className={cn("flex min-w-0 items-center gap-1", className)} title={t("chatroomThread", { title: entry.title })}>
        <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{entry.title || t("chatroomThreadFallback")}</span>
      </span>
    );
  }
  const channel = entry.kind === "channel" ? entry.channel : null;
  const color = channel?.color ?? undefined;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)} style={color ? { color } : undefined}>
      {channel?.icon ? (
        <LazyLucideIcon name={channel.icon} className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Hash className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{channel ? channel.name : t("mainChannel")}</span>
    </span>
  );
}

function MessageList({
  messages,
  loading,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  selfId,
  options,
  tints,
  onReply,
  onDelete,
}: {
  messages: LiveChatMessage[];
  loading: boolean;
  options: LiveChatOptions;
  /** Persona → couleur de son groupe (usePersonaTints). */
  tints: Record<string, string>;
  hasOlder: boolean;
  loadingOlder: boolean;
  /** Rend le nombre de messages lus (0 en cas d'échec). */
  onLoadOlder: () => Promise<number>;
  selfId: string | null;
  onReply: (message: LiveChatMessage) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("worldLiveChat");
  const tCommon = useTranslations("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  // Distance au bas avant une remontée : les messages ajoutés au-dessus ne
  // doivent pas déplacer ce que le lecteur a sous les yeux.
  const fromBottomRef = useRef<number | null>(null);

  // Suit le bas tant que le lecteur y est ; s'il remonte lire l'historique,
  // un nouveau message ne le ramène pas de force.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (fromBottomRef.current !== null) {
      el.scrollTop = el.scrollHeight - fromBottomRef.current;
      fromBottomRef.current = null;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function loadOlder() {
    const el = scrollRef.current;
    if (el) fromBottomRef.current = el.scrollHeight - el.scrollTop;
    // Rien de lu : aucun rendu ne viendra consommer la position gardée.
    if ((await onLoadOlder()) === 0) fromBottomRef.current = null;
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
        // Le lecteur a bougé : une position gardée et jamais rendue (messages
        // tous déjà là) ne doit pas le déplacer au prochain message.
        if (!loadingOlder) fromBottomRef.current = null;
      }}
      className="min-h-0 flex-1 overflow-y-auto py-2"
    >
      {messages.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {loading ? tCommon("loading") : t("empty")}
        </p>
      ) : (
        <>
        {hasOlder && (
          <div className="flex justify-center px-4 pb-1">
            <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? tCommon("loading") : t("loadOlder")}
            </Button>
          </div>
        )}
        <ol role="log" aria-live="polite" className="flex flex-col">
          {messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              grouped={rowGrouped(messages, i)}
              continued={rowGrouped(messages, i + 1)}
              mine={m.user_id === selfId}
              options={options}
              personaTint={m.persona_id ? tints[m.persona_id] : undefined}
              onReply={() => onReply(m)}
              onDelete={() => onDelete(m.id)}
            />
          ))}
        </ol>
        </>
      )}
    </div>
  );
}

/**
 * Même auteur, même persona, à moins de cinq minutes d'écart : pas de nouvel
 * en-tête. Une action jouée (`/me`) ne se regroupe jamais : elle porte son nom.
 */
export function isGrouped(prev: LiveChatMessage | undefined, cur: LiveChatMessage): boolean {
  if (!prev || prev.user_id !== cur.user_id) return false;
  if ((prev.persona_id ?? null) !== (cur.persona_id ?? null)) return false;
  if (prev.is_action || cur.is_action) return false;
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
}

/** Le message `i` suit le précédent sans nouvel en-tête. Une réponse rouvre
 * toujours un en-tête : la citation s'y accroche. */
function rowGrouped(messages: LiveChatMessage[], i: number): boolean {
  const m = messages[i];
  return !!m && !m.reply_to_id && isGrouped(messages[i - 1], m);
}

/** `**gras**` et `*italique*` d'un message (lib/liveChatMarkdown). */
function LiveChatText({ text }: { text: string }) {
  const render = (spans: LiveChatSpan[]): ReactNode[] =>
    spans.map((s, i) =>
      s.type === "text" ? s.text : s.type === "strong" ? <strong key={i}>{render(s.children)}</strong> : <em key={i}>{render(s.children)}</em>,
    );
  return <>{render(parseLiveChatMarkdown(text))}</>;
}

/** Amène le message cité en vue et le fait briller un instant. */
function jumpTo(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-live-message="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.dataset.highlight = "true";
  window.setTimeout(() => delete el.dataset.highlight, 1500);
}

function MessageRow({
  message,
  grouped,
  continued = false,
  mine,
  options,
  personaTint,
  onReply,
  onDelete,
}: {
  message: LiveChatMessage;
  grouped: boolean;
  /** Le message suivant prolonge ce groupe (bulles : coin bas resserré). */
  continued?: boolean;
  /** Le message est le sien : il peut l'effacer, et ses bulles ont leur fond. */
  mine: boolean;
  options: LiveChatOptions;
  /** La couleur du groupe du persona, s'il en a une. */
  personaTint?: string;
  onReply: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("worldLiveChat");
  const format = useFormatter();
  const name = message.author?.username ?? "…";
  const time = format.dateTime(new Date(message.created_at), { hour: "2-digit", minute: "2-digit" });
  // Les options suivent le monde à l'affichage aussi : éteinte après coup,
  // une option ne colore plus et ne montre plus de persona (migration 241).
  const persona = options.personas ? (message.persona ?? null) : null;
  const color = options.colors ? (message.color ?? null) : null;
  const action = !!message.is_action;
  // `bubbles` : la mise en page du fil (actions /me comprises) ; `bubble` : ce
  // message-ci est une bulle — une action reste du texte en italique.
  const bubbles = options.bubbles;
  const bubble = bubbles && !action;
  const avatarUrl = persona ? persona.avatar_url : (message.author?.avatar_url ?? null);
  // Qui parle ou agit : le persona s'il y en a un, sinon le joueur.
  const speaker = persona?.name ?? name;
  // Le nom du persona prend la couleur de son groupe, comme dans les salons.
  const personaStyle = persona && personaTint ? { color: personaTint } : undefined;

  const actions = (
    <div
      data-testid="world-live-chat-actions"
      className={cn(
        "absolute flex h-5 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        // Ligne : dans la marge de droite (`pr-16`), sur la première ligne du
        // texte. Bulle : juste à côté d'elle, à mi-hauteur.
        !bubbles
          ? cn("-right-14", action ? "top-1.5" : "top-0")
          : "left-full top-1/2 ml-1 -translate-y-1/2",
      )}
    >
      <Button variant="ghost" size="icon-sm" className="size-6" onClick={onReply} aria-label={t("replyTo", { name })}>
        <Reply className="size-3.5" />
      </Button>
      {mine && (
        <Button variant="ghost" size="icon-sm" className="size-6" onClick={onDelete} aria-label={t("deleteMessage")}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <li
      data-live-message={message.id}
      data-mine={mine || undefined}
      // Un clic sur le message y répond — pas sur un lien, un bouton, ni
      // quand on vient de sélectionner du texte pour le copier.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;
        if (window.getSelection?.()?.toString()) return;
        onReply();
      }}
      className={cn(
        // Pas de fond au survol : seuls les boutons d'action apparaissent.
        "group relative flex cursor-pointer gap-3 px-4 data-[highlight=true]:bg-primary/10",
        bubbles
          ? // Bulles serrées ; l'avatar en haut du groupe, à hauteur du pseudo.
            // Les actions /me suivent le même espacement.
            cn("gap-2", grouped ? "pt-0.5" : "mt-2 pt-1")
          : // En-tête et action se centrent sur l'avatar (`pt-1.5`/`py-1.5`) :
            // la ligne n'ajoute qu'une petite marge.
            cn("pr-16 py-0.5", !grouped && "mt-2"),
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <UserProfileSheetTrigger userId={message.user_id} label={name}>
            <Avatar className="size-8 rounded-full">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="rounded-full text-xs">{speaker.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </UserProfileSheetTrigger>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {message.reply_to_id && (
          message.reply ? (
            <button
              type="button"
              onClick={() => jumpTo(message.reply!.id)}
              className="mb-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label={t("jumpTo")}
              data-testid="world-live-chat-quote"
            >
              <CornerUpLeft className="size-3 shrink-0" aria-hidden />
              <span className="shrink-0 font-semibold">{message.reply.username ?? "…"}</span>
              <span className="truncate">{liveChatPlainText(message.reply.content)}</span>
            </button>
          ) : (
            <p className="mb-0.5 flex items-center gap-1 text-xs italic text-muted-foreground" data-testid="world-live-chat-quote">
              <CornerUpLeft className="size-3 shrink-0" aria-hidden />
              {t("replyDeleted")}
            </p>
          )
        )}
        {!grouped && !action && (
          <div
            className={cn(
              // Centré sur l'avatar, à la hauteur de la première ligne d'un /me.
              "flex items-baseline gap-2",
              bubble ? "mb-0.5 px-3 pt-2 text-muted-foreground" : "pt-1.5",
            )}
          >
            <UserProfileSheetTrigger userId={message.user_id} label={name}>
              <span className={cn("hover:underline", bubble ? "text-xs" : "text-sm")} data-testid="world-live-chat-author">
                {persona ? (
                  t.rich("withPersona", {
                    user: (chunks) => <span className="font-semibold">{chunks}</span>,
                    persona: (chunks) => <span className="font-semibold" style={personaStyle}>{chunks}</span>,
                    userName: name,
                    personaName: persona.name,
                  })
                ) : (
                  <span className="font-semibold">{name}</span>
                )}
              </span>
            </UserProfileSheetTrigger>
            <time dateTime={message.created_at} className="text-xs text-muted-foreground">{time}</time>
          </div>
        )}
        <div className={cn("relative", bubbles && "w-fit max-w-[80%]")}>
          {action ? (
            // `/me` : l'action jouée, en italique, précédée de qui la joue.
            // Sur une ligne, elle se centre sur l'avatar (6 + 20 + 6 = 32 px) ;
            // avec les bulles, elle prend aussi leur retrait.
            <p
              className={cn("whitespace-pre-wrap break-words py-1.5 text-sm italic [&_em]:not-italic", bubbles && "px-3")}
              style={{ color: readableOnPage(color) }}
              data-testid="world-live-chat-action"
            >
              <span className="font-semibold" style={persona ? personaStyle : undefined}>{speaker}</span> <LiveChatText text={message.content} />
              <time dateTime={message.created_at} className="ml-2 text-xs not-italic text-muted-foreground">{time}</time>
            </p>
          ) : bubble ? (
            <p
              className={cn(
                "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                // Dans un groupe, les coins côté avatar se resserrent.
                grouped && "rounded-tl-md",
                continued && "rounded-bl-md",
                // Toutes à gauche ; les siennes se distinguent par leur fond.
                !color && (mine ? "bg-primary text-primary-foreground" : "bg-muted"),
              )}
              style={bubbleStyle(color)}
              data-testid="world-live-chat-bubble"
            >
              <LiveChatText text={message.content} />
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm" style={{ color: readableOnPage(color) }}>
              <LiveChatText text={message.content} />
            </p>
          )}
          {actions}
        </div>
      </div>
    </li>
  );
}

/** Ce que le joueur a choisi pour écrire (persona, couleur), gardé par monde dans ce navigateur. */
type ComposerPersona = Pick<Persona, "id" | "name" | "avatar_url" | "dialogue_color">;

const personaKey = (worldId: string) => `liveChat:persona:${worldId}`;
const colorKey = (worldId: string) => `liveChat:color:${worldId}`;

function readStored<T>(key: string, parse: (raw: string) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}

function parsePersona(raw: string): ComposerPersona | null {
  try {
    const p = JSON.parse(raw) as Partial<ComposerPersona>;
    return typeof p.id === "string" && typeof p.name === "string"
      ? { id: p.id, name: p.name, avatar_url: p.avatar_url ?? null, dialogue_color: p.dialogue_color ?? null }
      : null;
  } catch {
    return null;
  }
}

function Composer({
  worldId,
  userId,
  options,
  replyTo,
  onCancelReply,
  onSend,
  onEscape,
}: {
  worldId: string;
  userId: string | null;
  options: LiveChatOptions;
  replyTo: LiveChatMessage | null;
  onCancelReply: () => void;
  onSend: (text: string, extras: SendExtras) => Promise<boolean>;
  onEscape: () => void;
}) {
  const t = useTranslations("worldLiveChat");
  const tChatrooms = useTranslations("chatrooms");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Persona et couleur (migration 241) : lus au montage, gardés par monde.
  const [persona, setPersonaRaw] = useState<ComposerPersona | null>(() => readStored(personaKey(worldId), parsePersona));
  const [color, setColorRaw] = useState<string | null>(() => readStored(colorKey(worldId), (raw) => raw));

  function setPersona(p: ComposerPersona | null) {
    setPersonaRaw(p);
    writeStored(personaKey(worldId), p ? JSON.stringify(p) : null);
    // Comme dans les salons : un persona qui a sa couleur de dialogue l'apporte.
    if (p?.dialogue_color) setColor(p.dialogue_color);
  }
  function setColor(c: string | null) {
    setColorRaw(c);
    writeStored(colorKey(worldId), c);
  }
  // Sans bulles, la couleur ne teinte que du texte : son opacité ne compte pas.
  const sentColor = color && !options.bubbles ? normalizeHexColor(color) : color;

  // Le panneau s'ouvre pour écrire : le curseur y va directement (desktop).
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  // Choisir un message à qui répondre : on écrit aussitôt.
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text, {
      color: options.colors ? sentColor : null,
      personaId: options.personas ? (persona?.id ?? null) : null,
    });
    setSending(false);
    if (ok) setText("");
    // Le champ n'est jamais désactivé pendant l'envoi (`readOnly`) : désactivé,
    // il perdait le curseur, et ce focus partait avant sa réactivation.
    inputRef.current?.focus();
  }

  return (
    <div className="shrink-0 border-t">
    {replyTo && (
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground" data-testid="world-live-chat-replying">
        <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />
        <span className="shrink-0">{t("replyingTo", { name: replyTo.author?.username ?? "…" })}</span>
        <span className="min-w-0 flex-1 truncate">{liveChatPlainText(replyTo.content)}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancelReply} aria-label={t("cancelReply")}>
          <X />
        </Button>
      </div>
    )}
    <form
      className="flex items-center gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {options.personas && (
        <span className="flex shrink-0 items-center" data-testid="world-live-chat-persona">
          <PersonaPickerDialog
            selected={persona as Persona | null}
            onSelect={(p) => setPersona(p ? { id: p.id, name: p.name, avatar_url: p.avatar_url, dialogue_color: p.dialogue_color ?? null } : null)}
            required={false}
            userId={userId}
            worldId={worldId}
            trigger={
              <Button type="button" variant="ghost" size="icon" aria-label={persona ? persona.name : t("choosePersona")} title={persona ? persona.name : t("choosePersona")}>
                {persona ? (
                  <Avatar className="size-7 rounded-full">
                    {persona.avatar_url && <AvatarImage src={persona.avatar_url} alt="" />}
                    <AvatarFallback className="rounded-full text-xs">{persona.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <UserRound />
                )}
              </Button>
            }
          />
          {persona && (
            <Button type="button" variant="ghost" size="icon-sm" className="size-6" onClick={() => setPersona(null)} aria-label={t("clearPersona")}>
              <X className="size-3.5" />
            </Button>
          )}
        </span>
      )}
      {options.colors && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={tChatrooms("dialogColorTitle")} title={tChatrooms("dialogColorTitle")}>
              <span
                className={cn("size-4 rounded-full border border-border", !sentColor && "bg-muted")}
                style={sentColor ? { backgroundColor: sentColor } : undefined}
                data-testid="world-live-chat-color-swatch"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3">
            {/* L'opacité ne vaut que pour le fond des bulles : sans elles, pas de réglage. */}
            <HsvColorPicker
              color={sentColor ?? DEFAULT_PLAYER_COLOR}
              onChange={setColor}
              alpha={options.bubbles}
              maxAlpha={BUBBLE_MAX_ALPHA}
            />
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setColor(null)}>
              {tChatrooms("colorReset")}
            </Button>
          </PopoverContent>
        </Popover>
      )}
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // Échap retire d'abord la réponse en cours, puis referme.
          if (replyTo) onCancelReply();
          else onEscape();
        }}
        maxLength={MAX_LENGTH}
        placeholder={t(options.actions ? "placeholderActions" : "placeholder")}
        aria-label={t("placeholder")}
        readOnly={sending}
        aria-busy={sending || undefined}
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label={t("send")}>
        <SendHorizontal />
      </Button>
    </form>
    </div>
  );
}
