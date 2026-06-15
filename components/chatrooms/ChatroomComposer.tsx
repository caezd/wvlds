"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { TABLE, RPC } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { Button } from "../ui/button";
import { SendHorizontal, Component, Dices, Timer, Pipette, X, ImagePlus, Clapperboard, Clock, Eye, Lock, Sword, Megaphone, Cloud, Heart, Quote } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toWebP } from "@/lib/imageUtils";
import { ParagraphBlockEditor } from "./ParagraphBlockEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiceDialog } from "./blocks/DiceDialog";
import { EllipseDialog } from "./blocks/EllipseDialog";
import { NarrativeBlockDialog } from "./blocks/NarrativeBlockDialog";
import { NpcDialog } from "./blocks/NpcBlock";
import { AlertDialog } from "./blocks/AlertBlock";
import { WeatherDialog } from "./blocks/WeatherBlock";
import { HpDialog } from "./blocks/HpBlock";
import { parseChatBlock } from "@/lib/chat-blocks";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ChatroomComposer({
  chatId,
  presetPersona,
  onTyping,
  onPersonaChange,
  chatroomKey,
  onEditLastMessage,
  placeholder = "Écris ton message en Markdown…",
  onResolveChat,
  onAfterSend,
  typingLine,
}: {
  /** Chatroom existante. Laisser vide pour le mode « création » (voir onResolveChat). */
  chatId?: string;
  presetPersona: Persona | null;
  onTyping?: () => void;
  onPersonaChange?: (p: Persona | null) => void;
  chatroomKey?: string | null;
  onEditLastMessage?: () => void;
  placeholder?: string;
  /** Libellé « … est en train d'écrire ». Affiché dans une languette qui se
   *  déplie depuis l'arrière du composer. */
  typingLine?: string | null;
  /**
   * Mode « création » : si fourni et qu'aucun chatId n'est passé, appelé au
   * premier envoi pour créer/obtenir la chatroom cible avant d'y insérer le
   * message. Retourner null pour annuler l'envoi.
   */
  onResolveChat?: () => Promise<{ chatId: string; chatroomKey?: string | null } | null>;
  /** Appelé après un envoi réussi avec l'id de la chatroom (ex: navigation). */
  onAfterSend?: (chatId: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const inFlightRef = useRef(false);

  const [value, setValue] = useState("");
  const { chatroom_media } = useFeatureFlags();
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const pendingMediaPreviews = pendingMedia.map((f) => URL.createObjectURL(f));
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    presetPersona,
  );
  const BUBBLE_KEY = `bubbleMode:${chatId ?? "new"}`;
  const BUBBLE_COLOR_KEY = `bubbleColor:${chatId ?? "new"}`;
  const [bubbleMode, setBubbleModeRaw] = useState(false);
  const [bubbleColor, setBubbleColorRaw] = useState<string | null>(null);
  useEffect(() => {
    try { setBubbleModeRaw(localStorage.getItem(BUBBLE_KEY) === "1"); } catch { }
    try { setBubbleColorRaw(localStorage.getItem(BUBBLE_COLOR_KEY) || null); } catch { }
  }, [BUBBLE_KEY, BUBBLE_COLOR_KEY]);
  function setBubbleMode(v: boolean) {
    setBubbleModeRaw(v);
    try { if (v) localStorage.setItem(BUBBLE_KEY, "1"); else localStorage.removeItem(BUBBLE_KEY); } catch { }
  }
  function setBubbleColor(v: string | null) {
    setBubbleColorRaw(v);
    try { if (v) localStorage.setItem(BUBBLE_COLOR_KEY, v); else localStorage.removeItem(BUBBLE_COLOR_KEY); } catch { }
  }

  // Note privée
  type Participant = { id: string; username: string | null; avatar_url: string | null };
  const [visibleTo, setVisibleTo] = useState<string[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  async function togglePrivateNote() {
    if (visibleTo !== null) { setVisibleTo(null); setParticipants([]); return; }
    if (!chatId || !userId) return;
    const { data: msgs } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .select("author_id")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((msgs ?? []).map((m: { author_id: string }) => m.author_id).filter((id: string) => id !== userId))];
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);
      setParticipants((profiles ?? []) as Participant[]);
    }
    setVisibleTo([]);
  }

  // Bannière
  const bannerInputRef = useRef<HTMLInputElement>(null);
  async function uploadBanner(file: File) {
    if (!chatId) return;
    const converted = await toWebP(file);
    const path = `${chatId}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from("chat-banners").upload(path, converted, { contentType: "image/webp" });
    if (error) { toast.error("Erreur upload bannière.", { description: error.message }); return; }
    const { data } = supabase.storage.from("chat-banners").getPublicUrl(path);
    await sendRaw(JSON.stringify({ _type: "banner", url: data.publicUrl }));
  }

  function handleOuterPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!chatroom_media) return;
    const images = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (images.length === 0) return;
    e.preventDefault();
    setPendingMedia((prev) => [...prev, ...images]);
  }

  async function uploadMedia(files: File[], targetChatId: string): Promise<{ url: string; name: string }[]> {
    const results: { url: string; name: string }[] = [];
    for (const rawFile of files) {
      const file = await toWebP(rawFile);
      const ext = file.name.split(".").pop() ?? "webp";
      const path = `${targetChatId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type });
      if (error) { toast.error("Erreur upload image.", { description: error.message }); continue; }
      const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
      results.push({ url: data.publicUrl, name: file.name });
    }
    return results;
  }

  async function sendRaw(text: string): Promise<boolean> {
    if (!text && pendingMedia.length === 0) return false;
    if (!userId) return false;
    if (!selectedPersona) {
      toast.error("Sélectionnez un persona avant d’envoyer.");
      return false;
    }
    if (visibleTo !== null && visibleTo.length === 0) {
      toast.warning("Choisissez au moins un destinataire pour la note privée.");
      return false;
    }
    // Verrou anti-double-création (mode « création » uniquement) : évite de
    // créer deux chatrooms si l'envoi est déclenché deux fois rapidement.
    const guarded = !chatId && !!onResolveChat;
    if (guarded) {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
    }
    try {
      // Résolution de la chatroom cible : existante (chatId) ou créée à la volée
      // (mode « création » via onResolveChat).
      let targetChatId = chatId ?? null;
      let targetKey = chatroomKey ?? null;
      if (!targetChatId && onResolveChat) {
        const resolved = await onResolveChat();
        if (!resolved) return false;
        targetChatId = resolved.chatId;
        targetKey = resolved.chatroomKey ?? null;
      }
      if (!targetChatId) return false;

      const content = targetKey ? await encryptMessage(text, targetKey) : text;
      const uploadedMedia = pendingMedia.length > 0 ? await uploadMedia(pendingMedia, targetChatId) : [];

      const wordCount = parseChatBlock(text) !== null
        ? 0
        : text.trim().split(/\s+/).filter(Boolean).length;

      const visibleToLabels = visibleTo !== null
        ? visibleTo
            .map((id) => { const p = participants.find((pp) => pp.id === id); return p?.username ? `@${p.username}` : null; })
            .filter((l): l is string => l !== null)
        : null;

      const metadata = {
        ...(wordCount > 0 ? { word_count: wordCount } : {}),
        ...(bubbleMode ? { bubbles: true, ...(bubbleColor ? { bubbleColor } : {}) } : {}),
        ...(uploadedMedia.length > 0 ? { media: uploadedMedia } : {}),
        ...(visibleToLabels?.length ? { visible_to_labels: visibleToLabels } : {}),
      };
      const finalMetadata = Object.keys(metadata).length > 0 ? metadata : null;
      const { data: newMessage, error } = await supabase
        .from(TABLE.CHAT_MESSAGES)
        .insert({
          chat_id: targetChatId,
          author_id: userId,
          content,
          persona_id: selectedPersona.id,
          metadata: finalMetadata,
          ...(visibleTo !== null ? { visible_to: [userId, ...visibleTo] } : {}),
        })
        .select("id, world_id")
        .single();
      if (error) { toast.error("Envoi impossible.", { description: error.message }); return false; }
      await supabase.from(TABLE.CHATROOM_PERSONA_PREFS).upsert(
        { chat_id: targetChatId, user_id: userId, persona_id: selectedPersona.id },
        { onConflict: "chat_id,user_id" },
      );
      const { error: rpcErr } = await supabase.rpc(RPC.AWARD_EVENT, {
        p_event: "message_posted",
        p_ref: newMessage.id,
        p_meta: { chat_id: targetChatId, world_id: newMessage.world_id, persona_id: selectedPersona.id },
      });
      if (rpcErr) console.error("award_event failed:", rpcErr);
      onAfterSend?.(targetChatId);
      return true;
    } finally {
      if (guarded) inFlightRef.current = false;
    }
  }

  async function send() {
    const text = value.trim();
    if (!text && pendingMedia.length === 0) return;
    const sent = await sendRaw(text);
    // Ne clear que si l'envoi a vraiment eu lieu (pas d'erreur, pas d'annulation,
    // pas de persona manquant) et qu'on n'est pas en mode création (navigation
    // imminente, inutile de vider).
    if (sent && !onResolveChat) {
      setValue("");
      setPendingMedia([]);
      setVisibleTo(null);
      setParticipants([]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    // Pas d’envoi si l’utilisateur est en composition IME
    if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return;

    if (e.key === "ArrowUp" && !value.trim()) {
      e.preventDefault();
      onEditLastMessage?.();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const canSend = (value.trim().length > 0 || pendingMedia.length > 0) && !!selectedPersona;

  return (
    <div className="group/composer relative w-full [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width)">
      {/* Languette « en train d'écrire » : cachée derrière le composer (fond
          opaque qui la masque), elle glisse vers le haut pour dépasser au-dessus
          quand quelqu'un écrit. */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-full z-0 transition-all duration-300 ease-out",
          typingLine ? "translate-y-8 opacity-100" : "translate-y-full opacity-0",
        )}
      >
        <div className="w-full rounded-t-2xl border border-b-0 border-border-soft bg-card px-5 pt-2 pb-10 text-xs italic text-muted-foreground">
          {typingLine}
        </div>
      </div>

      <div
        className="relative z-10 cursor-text overflow-clip p-2.5 contain-inline-size bg-background border border-border-soft grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] rounded-3xl"
        style={{ cornerShape: "superellipse(1.1)" } as React.CSSProperties}
        onPaste={handleOuterPaste}
      >
        {/* Input bannière caché */}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await uploadBanner(file);
            e.target.value = "";
          }}
        />

        {/* Destinataires note privée */}
        {visibleTo !== null && (
          <div className="[grid-area:header] flex items-center gap-2 flex-wrap px-2 pt-2 pb-0.5">
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            {participants.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setVisibleTo((prev) =>
                    prev?.includes(p.id)
                      ? prev.filter((id) => id !== p.id)
                      : [...(prev ?? []), p.id],
                  )
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  visibleTo.includes(p.id)
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border-soft text-muted-foreground hover:text-foreground",
                )}
              >
                @{p.username ?? p.id.slice(0, 8)}
              </button>
            ))}
            {!participants.length && (
              <span className="text-xs text-muted-foreground italic">Aucun autre participant dans ce salon.</span>
            )}
            <button
              type="button"
              onClick={() => { setVisibleTo(null); setParticipants([]); }}
              className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Preview médias collés */}
        {pendingMedia.length > 0 && (
          <div className="[grid-area:header] flex gap-2 flex-wrap px-1.5 pt-1 pb-0.5">
            {pendingMedia.map((file, i) => (
              <div key={i} className="relative group/thumb size-14 rounded-lg overflow-hidden shrink-0">
                <img
                  src={pendingMediaPreviews[i]}
                  alt={file.name}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPendingMedia((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                >
                  <X className="size-4 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Zone de saisie */}
        <div className="flex min-h-10 items-start overflow-hidden [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
          <div className="flex-1">
            <ParagraphBlockEditor
              value={value}
              onChange={(v) => { setValue(v); onTyping?.(); }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="text-sm w-full"
            />
          </div>
        </div>

        {/* Sélecteur de persona + actions */}
        <div className="[grid-area:leading]">
          <span className="flex items-center gap-2">
            <PersonaPickerDialog
              selected={selectedPersona}
              onSelect={async (p) => {
                setSelectedPersona(p);
                onPersonaChange?.(p);
                if (p && userId && chatId) {
                  await supabase.from(TABLE.CHATROOM_PERSONA_PREFS).upsert(
                    { chat_id: chatId, user_id: userId, persona_id: p.id },
                    { onConflict: "chat_id,user_id" },
                  );
                }
              }}
              required
              userId={userId}
            />
            <BlocksDropdown
              onSend={(content) => void sendRaw(content)}
              bubbleMode={bubbleMode}
              onBubbleModeChange={setBubbleMode}
              bubbleColor={bubbleColor}
              onBubbleColorChange={setBubbleColor}
              chatId={chatId}
              onBannerSelect={chatId ? () => bannerInputRef.current?.click() : undefined}
              visibleTo={visibleTo}
              onPrivateNoteToggle={() => void togglePrivateNote()}
            />
          </span>
        </div>

        {/* Bouton envoyer */}
        <div className="[grid-area:trailing]">
          <div
            className={cn(
              "min-w-9 transition-transform",
              value.trim() ? "visible scale-100" : "invisible scale-80",
              selectedPersona ? "ml-2" : "ml-0",
            )}
          >
            <Button
              size="icon"
              onClick={() => void send()}
              disabled={!canSend}
              aria-disabled={!canSend}
              title={selectedPersona ? "Envoyer" : "Choisissez un persona"}
            >
              <SendHorizontal />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BUBBLE_COLORS = [
  { label: "Bleu",    value: "#1d4ed8" },
  { label: "Indigo",  value: "#4338ca" },
  { label: "Violet",  value: "#7c3aed" },
  { label: "Rose",    value: "#be185d" },
  { label: "Rouge",   value: "#b91c1c" },
  { label: "Ambre",   value: "#b45309" },
  { label: "Vert",    value: "#047857" },
  { label: "Cyan",    value: "#0e7490" },
  { label: "Ardoise", value: "#475569" },
  { label: "Zinc",    value: "#3f3f46" },
];

function BlocksDropdown({
  onSend,
  bubbleMode,
  onBubbleModeChange,
  bubbleColor,
  onBubbleColorChange,
  chatId,
  onBannerSelect,
  visibleTo,
  onPrivateNoteToggle,
}: {
  onSend: (content: string) => void;
  bubbleMode: boolean;
  onBubbleModeChange: (v: boolean) => void;
  bubbleColor: string | null;
  onBubbleColorChange: (v: string | null) => void;
  chatId?: string;
  onBannerSelect?: () => void;
  visibleTo: string[] | null;
  onPrivateNoteToggle: () => void;
}) {
  const { chatroom_blocks, block_npc, block_hp, block_alert, block_weather, block_whisper } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"dice" | "ellipse" | "scene" | "flashback" | "reveal" | "npc" | "alert" | "weather" | "hp" | "whisper" | null>(null);
  const activeOptionsCount = [bubbleMode, visibleTo !== null].filter(Boolean).length;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Insérer un bloc"
            className="relative size-9 rounded-full shrink-0 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Component className="h-4 w-4" />
            {activeOptionsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground leading-none">
                {activeOptionsCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56 p-0">
          <ScrollArea className="max-h-72">
            <div className="p-1">
              <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("dice"); }}>
                <Dices className="mr-2 h-4 w-4" />
                Lancer un dé
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("ellipse"); }}>
                <Timer className="mr-2 h-4 w-4" />
                Ellipse de temps
              </DropdownMenuItem>
              {onBannerSelect && (
                <DropdownMenuItem onSelect={() => { setOpen(false); onBannerSelect(); }}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Bannière
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("scene"); }}>
                <Clapperboard className="mr-2 h-4 w-4" />
                Bloc scène
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("flashback"); }}>
                <Clock className="mr-2 h-4 w-4" />
                Flashback
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("reveal"); }}>
                <Eye className="mr-2 h-4 w-4" />
                Révélation
              </DropdownMenuItem>
              {chatroom_blocks && (block_npc || block_hp || block_alert || block_weather || block_whisper) && (
                <DropdownMenuSeparator />
              )}
              {chatroom_blocks && block_npc && (
                <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("npc"); }}>
                  <Sword className="mr-2 h-4 w-4" />
                  Mini-fiche PNJ
                </DropdownMenuItem>
              )}
              {chatroom_blocks && block_hp && (
                <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("hp"); }}>
                  <Heart className="mr-2 h-4 w-4" />
                  Jauge de vie
                </DropdownMenuItem>
              )}
              {chatroom_blocks && block_alert && (
                <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("alert"); }}>
                  <Megaphone className="mr-2 h-4 w-4" />
                  Alerte narrative
                </DropdownMenuItem>
              )}
              {chatroom_blocks && block_weather && (
                <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("weather"); }}>
                  <Cloud className="mr-2 h-4 w-4" />
                  Météo et ambiance
                </DropdownMenuItem>
              )}
              {chatroom_blocks && block_whisper && (
                <DropdownMenuItem onSelect={() => { setOpen(false); setActiveTool("whisper"); }}>
                  <Quote className="mr-2 h-4 w-4" />
                  Aparté
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={bubbleMode}
                onCheckedChange={onBubbleModeChange}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="flex items-center gap-1.5">
                  Dialogues en bulles
                  <Hint side="right">
                    Les paragraphes commençant par <span className="font-mono">&quot;…&quot;</span> ou des guillemets français seront affichés en bulle de dialogue. Si le paragraphe est suivi d&apos;une incise (ex. <span className="italic">dit-il</span>), elle apparaît en bout de bulle.
                  </Hint>
                </span>
              </DropdownMenuCheckboxItem>
              {bubbleMode && (
                <div
                  className="flex items-center gap-2 px-8 py-1 text-xs text-muted-foreground"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span>Couleur</span>
                  <button
                    type="button"
                    title="Choisir une couleur"
                    onClick={(e) => { e.stopPropagation(); setOpen(false); setColorPickerOpen(true); }}
                    className="size-3.5 rounded-full border border-border/60 transition-shadow hover:ring-2 hover:ring-ring flex-shrink-0"
                    style={bubbleColor ? { backgroundColor: bubbleColor } : undefined}
                  >
                    {!bubbleColor && <Pipette className="size-2.5 m-auto text-muted-foreground" />}
                  </button>
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={visibleTo !== null}
                onCheckedChange={onPrivateNoteToggle}
                onSelect={(e) => e.preventDefault()}
                disabled={!chatId}
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  Note privée
                </span>
              </DropdownMenuCheckboxItem>
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <div className="flex">
            {/* Aperçu + jauge de contraste */}
            <div className="w-40 shrink-0 bg-background flex flex-col gap-3 p-4 pr-6">
              <div className="flex flex-col gap-3 flex-1 justify-center">
                {["Bonjour...", "Comment vas-tu ?"].map((text, i) => (
                  <div key={i} className="inline-flex items-end gap-2 flex-nowrap">
                    <div
                      className={cn("rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm leading-snug whitespace-nowrap", !bubbleColor && "bg-muted")}
                      style={bubbleColor ? { backgroundColor: bubbleColor + "33" } : undefined}
                    >
                      {text}
                    </div>
                    {i === 0 && <span className="text-xs text-muted-foreground italic pb-1 shrink-0">dit-il.</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Contrôles */}
            <div className="flex-1 flex flex-col gap-4 p-4 border-l border-border">
              <DialogHeader>
                <DialogTitle className="text-sm">Couleur des dialogues</DialogTitle>
              </DialogHeader>

              <HsvColorPicker
                color={bubbleColor ?? "#1d4ed8"}
                onChange={onBubbleColorChange}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onBubbleColorChange(null)}
                  className="flex-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Réinitialiser
                </button>
                <Button size="sm" onClick={() => setColorPickerOpen(false)}>
                  Confirmer
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DiceDialog
        open={activeTool === "dice"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <EllipseDialog
        open={activeTool === "ellipse"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <NarrativeBlockDialog
        blockType="scene"
        open={activeTool === "scene"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <NarrativeBlockDialog
        blockType="flashback"
        open={activeTool === "flashback"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <NarrativeBlockDialog
        blockType="reveal"
        open={activeTool === "reveal"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <NarrativeBlockDialog
        blockType="whisper"
        open={activeTool === "whisper"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <NpcDialog
        open={activeTool === "npc"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <HpDialog
        open={activeTool === "hp"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <AlertDialog
        open={activeTool === "alert"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <WeatherDialog
        open={activeTool === "weather"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
    </>
  );
}

// ─── Helpers couleur HSV ───────────────────────────────────────────────────
function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max, s = max === 0 ? 0 : d / max;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(hh * 360), s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  return "#" + [r + m, g + m, b + m].map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("");
}

function HsvColorPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hsv = hexToHsv(color) ?? { h: 220, s: 0.85, v: 0.85 };
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 220;
    const H = canvas.offsetHeight || 150;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = `hsl(${hsv.h},100%,50%)`;
    ctx.fillRect(0, 0, W, H);
    const wg = ctx.createLinearGradient(0, 0, W, 0);
    wg.addColorStop(0, "rgba(255,255,255,1)");
    wg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const px = hsv.s * W, py = (1 - hsv.v) * H;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h, hsv.s, hsv.v]);

  function pickSV(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onChangeRef.current(hsvToHex(hsvRef.current.h, s, v));
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-[6px] cursor-crosshair"
        style={{ height: 150 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickSV(e); }}
        onPointerMove={(e) => { if (e.buttons > 0) pickSV(e); }}
      />

      {/* Slider teinte */}
      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
      >
        <input
          type="range" min="0" max="360" value={hsv.h}
          onChange={(e) => onChangeRef.current(hsvToHex(parseInt(e.target.value), hsvRef.current.s, hsvRef.current.v))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
          style={{ left: `calc(${(hsv.h / 360) * 100}% - 6px)`, backgroundColor: `hsl(${hsv.h},100%,50%)` }}
        />
      </div>

      {/* Couleurs prédéfinies */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {BUBBLE_COLORS.map((c) => (
          <button
            key={c.value} type="button" title={c.label}
            onClick={() => onChangeRef.current(c.value)}
            className="h-4 w-4 rounded-sm border border-border/40 hover:ring-2 hover:ring-ring transition-shadow"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
    </div>
  );
}
