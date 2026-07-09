"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { TABLE, RPC } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTagChips } from "@/hooks/useTagChips";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { ContentWarningChipInput } from "@/components/chatrooms/ContentWarningChipInput";
import { Button } from "../ui/button";
import { SendHorizontal, Component, Dices, Pipette, X, ImagePlus, Eye, Lock, Sword, Heart, Square, Anchor, CalendarDays, MapPin, MessageCircle, MessageSquareText, Check, AlertTriangle, Vote, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toWebP } from "@/lib/imageUtils";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { ParagraphBlockEditor } from "./ParagraphBlockEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiceDialog } from "./blocks/DiceDialog";
import { NarrativeBlockDialog } from "./blocks/NarrativeBlockDialog";
import { NpcDialog } from "./blocks/NpcBlock";
import { HpDialog } from "./blocks/HpBlock";
import { CalloutDialog } from "./blocks/CalloutBlock";
import { AnchorDialog } from "./blocks/AnchorDialog";
import { ChoiceDialog } from "./blocks/ChoiceBlock";
import {
  computeWordCount,
  extractMentions,
  buildVisibleToLabels,
  buildMessageMetadata,
  shouldApplyContentWarnings,
} from "@/lib/composerMessage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type MapPinOption = { id: string; title: string; color: string };
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

export function ChatroomComposer({
  chatId,
  worldId,
  presetPersona,
  onTyping,
  onPersonaChange,
  chatroomKey,
  onEditLastMessage,
  placeholder = "Écris ton message en Markdown…",
  onResolveChat,
  onAfterSend,
  onMessageSent,
  typingLine,
  onAnchorSent,
  worldTimelineConfig,
  timelineDate,
  onTimelineDateChange,
  mapPins,
  mapPinId,
  onMapPinChange,
}: {
  /** Chatroom existante. Laisser vide pour le mode « création » (voir onResolveChat). */
  chatId?: string;
  worldId?: string | null;
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
  /** Appelé après un envoi réussi avec le texte brut (avant chiffrement) — utilisé pour valider les défis. */
  onMessageSent?: (messageId: number, chatId: string, plainText: string) => void;
  /** Appelé après l'envoi d'un bloc anchor avec le message_id et le label. */
  onAnchorSent?: (messageId: number, label: string) => void;
  worldTimelineConfig?: WorldTimelineConfig | null;
  timelineDate?: WorldTimelineDate | null;
  onTimelineDateChange?: (d: WorldTimelineDate | null) => void;
  mapPins?: MapPinOption[];
  mapPinId?: string | null;
  onMapPinChange?: (id: string | null) => void;
}) {
  const tChatrooms = useTranslations("chatrooms");
  const tPersonas = useTranslations("personas");
  const tDms = useTranslations("dms");
  const supabase = useMemo(() => createClient(), []);
  const { userId, username } = useCurrentUser();
  const inFlightRef = useRef(false);
  const pendingBlockMediaRef = useRef<{ url: string; name: string }[]>([]);

  // Sur mobile (clavier virtuel), Maj+Entrée n'est pas accessible : on inverse
  // le rôle d'Entrée dans le composer (cf. ParagraphBlockEditor `invertEnter`).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const DRAFT_KEY = `draft:${chatId ?? "new"}`;
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Initialiser à "" pour que le rendu SSR corresponde au premier rendu client
  // (localStorage n'est pas disponible côté serveur → hydration mismatch sinon).
  const [value, setValue] = useState("");
  useEffect(() => {
    // Charge le brouillon uniquement après hydration, côté client.
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setValue(draft);
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        if (value) localStorage.setItem(DRAFT_KEY, value);
        else localStorage.removeItem(DRAFT_KEY);
      } catch { }
    }, 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [value, DRAFT_KEY]);
  const { chatroom_media } = useFeatureFlags();
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const pendingMediaPreviews = pendingMedia.map((f) => URL.createObjectURL(f));
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    presetPersona,
  );
  const BUBBLE_KEY = `bubbleMode:${chatId ?? "new"}`;
  const BUBBLE_COLOR_KEY = `bubbleColor:${chatId ?? "new"}`;
  const [bubbleMode, setBubbleModeRaw] = useState(false);
  const [bubbleColor, setBubbleColorRaw] = useState<string | null>(
    presetPersona?.dialogue_color ?? null,
  );
  useEffect(() => {
    try { setBubbleModeRaw(localStorage.getItem(BUBBLE_KEY) === "1"); } catch { }
    // La couleur du persona (si définie) prend le pas sur le dernier choix
    // mémorisé pour cette chatroom.
    if (selectedPersona?.dialogue_color) {
      setBubbleColorRaw(selectedPersona.dialogue_color);
    } else {
      try { setBubbleColorRaw(localStorage.getItem(BUBBLE_COLOR_KEY) || null); } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BUBBLE_KEY, BUBBLE_COLOR_KEY]);
  function setBubbleMode(v: boolean) {
    setBubbleModeRaw(v);
    try { if (v) localStorage.setItem(BUBBLE_KEY, "1"); else localStorage.removeItem(BUBBLE_KEY); } catch { }
  }
  function setBubbleColor(v: string | null) {
    setBubbleColorRaw(v);
    try { if (v) localStorage.setItem(BUBBLE_COLOR_KEY, v); else localStorage.removeItem(BUBBLE_COLOR_KEY); } catch { }
  }
  /** Change la couleur des bulles et l'associe durablement au persona actif. */
  async function handleBubbleColorChange(v: string | null) {
    setBubbleColor(v);
    if (selectedPersona) {
      setSelectedPersona((prev) => (prev ? { ...prev, dialogue_color: v } : prev));
      await supabase.from(TABLE.PERSONAS).update({ dialogue_color: v }).eq("id", selectedPersona.id);
    }
  }

  const SMS_KEY = `smsMode:${chatId ?? "new"}`;
  const [smsMode, setSmsModeRaw] = useState(false);
  useEffect(() => {
    try { setSmsModeRaw(localStorage.getItem(SMS_KEY) === "1"); } catch { }
  }, [SMS_KEY]);
  function setSmsMode(v: boolean) {
    setSmsModeRaw(v);
    try { if (v) localStorage.setItem(SMS_KEY, "1"); else localStorage.removeItem(SMS_KEY); } catch { }
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

  // Avertissements de contenu (disclaimers / trigger warnings)
  const contentWarningsChips = useTagChips(null);

  // Bannière
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  async function uploadBanner(blob: Blob) {
    if (!chatId) return;
    setBannerUploading(true);
    try {
      const converted = await toWebP(new File([blob], "banner.jpg", { type: blob.type || "image/jpeg" }));
      const path = `${chatId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from("chat-banners").upload(path, converted, { contentType: "image/webp" });
      if (error) { toast.error("Erreur upload bannière.", { description: error.message }); return; }
      const { data } = supabase.storage.from("chat-banners").getPublicUrl(path);
      await sendRaw(JSON.stringify({ _type: "banner", url: data.publicUrl }));
      setBannerPickerOpen(false);
    } finally {
      setBannerUploading(false);
    }
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

  async function uploadIconImageForBlock(file: File): Promise<string | null> {
    if (!chatId) {
      toast.error("Sélectionnez d'abord une chatroom pour uploader une image.");
      return null;
    }
    const converted = await toWebP(file);
    const path = `${chatId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, converted, { contentType: "image/webp" });
    if (error) { toast.error("Erreur upload image.", { description: error.message }); return null; }
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    pendingBlockMediaRef.current = [...pendingBlockMediaRef.current, { url: data.publicUrl, name: file.name }];
    return data.publicUrl;
  }

  async function sendRaw(text: string): Promise<boolean> {
    if (!text && pendingMedia.length === 0) return false;
    if (!userId) return false;
    if (!selectedPersona) {
      toast.error(tChatrooms("selectPersonaFirst"));
      return false;
    }
    if (visibleTo !== null && visibleTo.length === 0) {
      toast.warning("Choisissez au moins un destinataire pour la note privée.");
      return false;
    }
    // Les avertissements ne concernent que le texte narratif : un envoi de
    // bloc structuré (dé, bannière, PNJ…) n'est jamais bloqué par cette
    // validation, puisqu'il n'affichera de toute façon jamais le bandeau.
    const applyContentWarnings = shouldApplyContentWarnings(text);
    if (applyContentWarnings && contentWarningsChips.tags !== null && contentWarningsChips.tags.length === 0) {
      toast.warning(tChatrooms("contentWarningEmpty"));
      return false;
    }
    // Verrou global : empêche tout double-envoi (touche maintenue, double-clic, etc.)
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
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
      const blockMedia = pendingBlockMediaRef.current;
      pendingBlockMediaRef.current = [];
      const allMedia = [...uploadedMedia, ...blockMedia];

      const finalMetadata = buildMessageMetadata({
        wordCount: computeWordCount(text),
        bubbleMode,
        bubbleColor,
        smsMode,
        media: allMedia,
        visibleToLabels: buildVisibleToLabels(visibleTo, participants),
        contentWarnings: applyContentWarnings ? contentWarningsChips.tags : null,
      });
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
      onMessageSent?.(newMessage.id, targetChatId, text);
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

      // Mentions : côté client car le contenu peut être chiffré côté serveur
      if (newMessage.world_id && text) {
        const mentioned = extractMentions(text);
        if (mentioned.length > 0) {
          const [{ data: mentionedProfiles }, { data: chatroomData }] = await Promise.all([
            supabase.from("profiles").select("id").in("username", mentioned),
            supabase.from("chatrooms").select("title, name").eq("id", targetChatId).single(),
          ]);
          const chatroomTitle = (chatroomData as { title?: string | null; name?: string | null } | null)?.title
            ?? (chatroomData as { title?: string | null; name?: string | null } | null)?.name
            ?? null;
          const recipientIds = (mentionedProfiles ?? [])
            .map((p: { id: string }) => p.id)
            .filter((id: string) => id !== userId);
          if (recipientIds.length > 0) {
            const { data: members } = await supabase
              .from(TABLE.WORLD_MEMBERS).select("user_id")
              .eq("world_id", newMessage.world_id).in("user_id", recipientIds);
            const validIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
            if (validIds.length > 0) {
              await supabase.from(TABLE.NOTIFICATIONS).insert(
                validIds.map((rid: string) => ({
                  recipient_id: rid,
                  type: "mention",
                  world_id: newMessage.world_id,
                  chat_id: targetChatId,
                  message_id: newMessage.id,
                  actor_id: userId,
                  actor_name: username,
                  content: chatroomTitle,
                })),
              );
            }
          }
        }
      }

      // Si c'est un bloc anchor, notifier le parent pour qu'il insère un chat_pin
      if (onAnchorSent && text.startsWith('{"_type":"anchor"')) {
        try {
          const parsed = JSON.parse(text) as { _type: string; label?: string };
          if (parsed._type === "anchor" && parsed.label && newMessage?.id) {
            onAnchorSent(newMessage.id, parsed.label);
          }
        } catch { /* non-bloquant */ }
      }

      onAfterSend?.(targetChatId);
      return true;
    } finally {
      inFlightRef.current = false;
    }
  }

  async function send() {
    const text = value.trim();
    if (!text && pendingMedia.length === 0) return;
    const sent = await sendRaw(text);
    // Ne clear que si l'envoi a vraiment eu lieu (pas d'erreur, pas d'annulation,
    // pas de persona manquant) et qu'on n'est pas en mode création (navigation
    // imminente, inutile de vider).
    if (sent) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { }
      if (!onResolveChat) {
        setValue("");
        setPendingMedia([]);
        setVisibleTo(null);
        setParticipants([]);
        contentWarningsChips.reset(null);
      }
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

    // ParagraphBlockEditor ne relaie "Enter" ici que lorsqu'il a déjà décidé
    // qu'il s'agit d'un envoi (cf. sa prop `invertEnter`, inversée sur mobile).
    if (e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) void send();
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
        <div className="w-full rounded-t-2xl border border-b-0 border-border bg-body px-5 pt-2 pb-10 text-xs italic text-muted-foreground">
          {typingLine}
        </div>
      </div>

      <div
        className={cn(
          "relative z-10 cursor-text overflow-clip p-2.5 contain-inline-size bg-background border grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] rounded-3xl",
          smsMode ? "border-mist-200 rounded-tr-[6px]" : "border-border-soft",
        )}
        style={{ cornerShape: "superellipse(1.1)" } as React.CSSProperties}
        onPaste={handleOuterPaste}
      >
        {/* Sélection + recadrage bannière */}
        <Dialog open={bannerPickerOpen} onOpenChange={setBannerPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{tChatrooms("banner")}</DialogTitle>
            </DialogHeader>
            <ImagePickerCropField
              aspect={16 / 7}
              uploading={bannerUploading}
              onConfirm={uploadBanner}
            />
          </DialogContent>
        </Dialog>

        {/* Bandeaux d'en-tête (note privée / avertissements / médias collés) :
            un seul conteneur pour la zone de grille "header" — sinon ces
            blocs, indépendants les uns des autres, se superposeraient au
            lieu de s'empiler quand plusieurs sont actifs en même temps. */}
        {(visibleTo !== null || contentWarningsChips.tags !== null || pendingMedia.length > 0) && (
          <div className="[grid-area:header] flex flex-col">
            {/* Destinataires note privée */}
            {visibleTo !== null && (
              <div className="flex items-center gap-2 flex-wrap px-2 pt-2 pb-0.5">
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

            {/* Avertissements de contenu (disclaimers / trigger warnings) */}
            {contentWarningsChips.tags !== null && (
              <ContentWarningChipInput
                tags={contentWarningsChips.tags}
                input={contentWarningsChips.input}
                onInputChange={contentWarningsChips.setInput}
                onKeyDown={contentWarningsChips.onKeyDown}
                onBlur={() => contentWarningsChips.add(contentWarningsChips.input)}
                onRemove={contentWarningsChips.remove}
                onDisable={contentWarningsChips.toggle}
                placeholder={tChatrooms("contentWarningPlaceholder")}
                className="px-2 pt-2 pb-0.5"
              />
            )}

            {/* Preview médias collés */}
            {pendingMedia.length > 0 && (
              <div className="flex gap-2 flex-wrap px-1.5 pt-1 pb-0.5">
                {pendingMedia.map((file, i) => (
                  <div key={i} className="relative group/thumb size-14 rounded-lg overflow-hidden shrink-0">
                    {/* blob: URL locale (pré-upload) — next/image ne peut pas l'optimiser côté serveur */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
              invertEnter={isMobile}
              formatting
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
                setBubbleColor(p?.dialogue_color ?? null);
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
              worldId={worldId}
            />
            <BlocksDropdown
              onSend={(content) => void sendRaw(content)}
              bubbleMode={bubbleMode}
              onBubbleModeChange={setBubbleMode}
              bubbleColor={bubbleColor}
              onBubbleColorChange={handleBubbleColorChange}
              smsMode={smsMode}
              onSmsModeChange={setSmsMode}
              chatId={chatId}
              onBannerSelect={chatId ? () => setBannerPickerOpen(true) : undefined}
              visibleTo={visibleTo}
              onPrivateNoteToggle={() => void togglePrivateNote()}
              contentWarningsActive={contentWarningsChips.tags !== null}
              onContentWarningsToggle={contentWarningsChips.toggle}
              onUploadIconImage={uploadIconImageForBlock}
              onCalloutClose={() => { pendingBlockMediaRef.current = []; }}
              worldTimelineConfig={worldTimelineConfig ?? null}
              timelineDate={timelineDate ?? null}
              onTimelineDateChange={onTimelineDateChange}
              mapPins={mapPins}
              mapPinId={mapPinId ?? null}
              onMapPinChange={onMapPinChange}
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
              title={selectedPersona ? tDms("send") : tPersonas("pick")}
            >
              <SendHorizontal />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimelineLabel(config: WorldTimelineConfig, date: WorldTimelineDate): string {
  const y = `${config.year_label} ${date.year}${config.era_name ? ` ${config.era_name}` : ""}`;
  const m = date.month !== null ? config.month_names[date.month] : null;
  const d = date.day !== null ? `${date.day} ` : "";
  return m ? `${d}${m}, ${y}` : y;
}

type ComposerMenuItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  checked?: boolean;
  disabled?: boolean;
  onActivate: () => void;
};

// ── Rangée de menu (icône + titre + description) partagée par les deux
// sections (blocs / options). Le survol/focus met à jour l'aperçu à droite.
function ComposerMenuRow({
  item,
  isActive,
  onHover,
}: {
  item: ComposerMenuItem;
  isActive: boolean;
  onHover: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      disabled={item.disabled}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={item.onActivate}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        isActive ? "bg-muted" : "hover:bg-muted/60",
        item.checked && "ring-1 ring-inset ring-primary/30 bg-primary/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          item.checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{item.title}</span>
          {item.checked && <Check className="h-3 w-3 shrink-0 text-primary" />}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
      </span>
    </button>
  );
}

function BlocksDropdown({
  onSend,
  bubbleMode,
  onBubbleModeChange,
  bubbleColor,
  onBubbleColorChange,
  smsMode,
  onSmsModeChange,
  chatId,
  onBannerSelect,
  visibleTo,
  onPrivateNoteToggle,
  contentWarningsActive,
  onContentWarningsToggle,
  onUploadIconImage,
  onCalloutClose,
  worldTimelineConfig,
  timelineDate,
  onTimelineDateChange,
  mapPins,
  mapPinId,
  onMapPinChange,
}: {
  onSend: (content: string) => void;
  bubbleMode: boolean;
  onBubbleModeChange: (v: boolean) => void;
  bubbleColor: string | null;
  onBubbleColorChange: (v: string | null) => void;
  smsMode: boolean;
  onSmsModeChange: (v: boolean) => void;
  chatId?: string;
  onBannerSelect?: () => void;
  visibleTo: string[] | null;
  onPrivateNoteToggle: () => void;
  contentWarningsActive: boolean;
  onContentWarningsToggle: () => void;
  onUploadIconImage?: (file: File) => Promise<string | null>;
  onCalloutClose?: () => void;
  worldTimelineConfig?: WorldTimelineConfig | null;
  timelineDate?: WorldTimelineDate | null;
  onTimelineDateChange?: (d: WorldTimelineDate | null) => void;
  mapPins?: MapPinOption[];
  mapPinId?: string | null;
  onMapPinChange?: (id: string | null) => void;
}) {
  const t = useTranslations("chatrooms");
  const { chatroom_blocks, block_npc, block_hp, block_choice } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"dice" | "reveal" | "npc" | "hp" | "callout" | "anchor" | "choice" | "timeline" | "location" | null>(null);
  const [draftDate, setDraftDate] = useState<WorldTimelineDate>({ year: 1, month: null, day: null });
  const [draftPinId, setDraftPinId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeOptionsCount = [bubbleMode, smsMode, visibleTo !== null, contentWarningsActive, !!(worldTimelineConfig && timelineDate), !!(mapPins?.length && mapPinId)].filter(Boolean).length;

  useEffect(() => {
    if (open) setActiveItemId("dice");
  }, [open]);

  const blockItems: ComposerMenuItem[] = [
    { id: "dice", icon: Dices, title: t("dice"), description: t("diceHint"), onActivate: () => { setOpen(false); setActiveTool("dice"); } },
    ...(onBannerSelect ? [{ id: "banner", icon: ImagePlus, title: t("banner"), description: t("bannerHint"), onActivate: () => { setOpen(false); onBannerSelect(); } }] : []),
    { id: "callout", icon: Square, title: t("calloutBtn"), description: t("calloutHint"), onActivate: () => { setOpen(false); setActiveTool("callout"); } },
    { id: "anchor", icon: Anchor, title: t("anchor"), description: t("anchorHint"), onActivate: () => { setOpen(false); setActiveTool("anchor"); } },
    { id: "reveal", icon: Eye, title: t("reveal"), description: t("revealHint"), onActivate: () => { setOpen(false); setActiveTool("reveal"); } },
    ...(chatroom_blocks && block_choice ? [{ id: "choice", icon: Vote, title: t("choice"), description: t("choiceHint"), onActivate: () => { setOpen(false); setActiveTool("choice"); } }] : []),
    ...(chatroom_blocks && block_npc ? [{ id: "npc", icon: Sword, title: t("npcCard"), description: t("npcHint"), onActivate: () => { setOpen(false); setActiveTool("npc"); } }] : []),
    ...(chatroom_blocks && block_hp ? [{ id: "hp", icon: Heart, title: t("healthBar"), description: t("hpHint"), onActivate: () => { setOpen(false); setActiveTool("hp"); } }] : []),
  ];

  const optionItems: ComposerMenuItem[] = [
    ...(worldTimelineConfig ? [{
      id: "timeline",
      icon: CalendarDays,
      title: timelineDate ? formatTimelineLabel(worldTimelineConfig, timelineDate) : t("timeline"),
      description: t("timelineHint"),
      checked: !!timelineDate,
      onActivate: () => {
        setOpen(false);
        setDraftDate(timelineDate ?? { year: worldTimelineConfig.current_year, month: worldTimelineConfig.current_month ?? null, day: null });
        setActiveTool("timeline");
      },
    }] : []),
    ...(mapPins && mapPins.length > 0 ? [{
      id: "location",
      icon: MapPin,
      title: mapPinId ? (mapPins.find(p => p.id === mapPinId)?.title ?? t("locationBtn")) : t("locationBtn"),
      description: t("locationHint"),
      checked: !!mapPinId,
      onActivate: () => { setOpen(false); setDraftPinId(mapPinId ?? null); setActiveTool("location"); },
    }] : []),
    { id: "bubbles", icon: MessageCircle, title: t("bubblesMode"), description: t("bubblesHint"), checked: bubbleMode, onActivate: () => onBubbleModeChange(!bubbleMode) },
    { id: "sms", icon: MessageSquareText, title: t("smsMode"), description: t("smsHint"), checked: smsMode, onActivate: () => onSmsModeChange(!smsMode) },
    { id: "privateNote", icon: Lock, title: t("privateNote"), description: t("privateNoteHint"), checked: visibleTo !== null, disabled: !chatId, onActivate: () => onPrivateNoteToggle() },
    { id: "contentWarning", icon: AlertTriangle, title: t("contentWarning"), description: t("contentWarningHint"), checked: contentWarningsActive, onActivate: () => onContentWarningsToggle() },
  ];

  const activeItem = [...blockItems, ...optionItems].find((i) => i.id === activeItemId) ?? blockItems[0] ?? null;

  function renderPreview(id: string): React.ReactNode {
    switch (id) {
      case "dice":
        return (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
            <Dices className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-[11px] text-muted-foreground">Attaque</div>
              <div className="font-mono text-base font-semibold">2d6+3 = 12</div>
            </div>
          </div>
        );
      case "banner":
        return (
          <div className="flex h-20 w-full items-center justify-center rounded-xl border border-border-soft bg-muted text-muted-foreground">
            <ImagePlus className="h-6 w-6" />
          </div>
        );
      case "callout":
        return (
          <div className="w-full rounded-xl border border-border-soft bg-card px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <Square className="h-3.5 w-3.5" /> Titre
            </div>
            <div className="text-xs text-muted-foreground">Texte de l&apos;encadré…</div>
          </div>
        );
      case "anchor":
        return (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Anchor className="h-3 w-3" /> Prologue
          </div>
        );
      case "reveal":
        return (
          <div className="w-full rounded-xl border border-dashed border-border-soft px-4 py-3 text-center text-xs text-muted-foreground">
            <Eye className="mx-auto mb-1 h-4 w-4" />
            Cliquer pour révéler
          </div>
        );
      case "choice":
        return (
          <div className="grid w-full grid-cols-3 gap-1.5">
            {["Nord", "Sud", "Est"].map((label, i) => (
              <div
                key={label}
                className={cn(
                  "rounded-lg border px-2 py-2 text-center text-[11px]",
                  i === 0 ? "border-violet-500/50 bg-violet-500/10" : "border-border-soft bg-card",
                )}
              >
                {label}
              </div>
            ))}
          </div>
        );
      case "npc":
        return (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base">🗡️</div>
            <div>
              <div className="text-sm font-medium">Garde du donjon</div>
              <div className="text-[11px] text-muted-foreground">PV 40 · ATQ 12 · DEF 8</div>
            </div>
          </div>
        );
      case "hp":
        return (
          <div className="w-full rounded-xl border border-border-soft bg-card px-4 py-3">
            <div className="mb-1 flex justify-between text-xs">
              <span>Garde</span><span>24/40</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/5 rounded-full bg-destructive" />
            </div>
          </div>
        );
      case "timeline":
        return (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              {timelineDate && worldTimelineConfig
                ? formatTimelineLabel(worldTimelineConfig, timelineDate)
                : `${worldTimelineConfig?.year_label ?? "An"} ${worldTimelineConfig?.current_year ?? 1}`}
            </div>
          </div>
        );
      case "location":
        return (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              {mapPinId ? (mapPins?.find(p => p.id === mapPinId)?.title ?? t("locationBtn")) : t("locationBtn")}
            </div>
          </div>
        );
      case "bubbles":
        return (
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-2">
              {["Bonjour...", "Comment vas-tu ?"].map((text, i) => (
                <div key={i} className="inline-flex flex-nowrap items-end gap-2">
                  <div
                    className={cn("rounded-xl rounded-tl-[3px] px-3 py-1.5 text-sm leading-snug", !bubbleColor && "bg-muted")}
                    style={bubbleColor ? { backgroundColor: bubbleColor + "33" } : undefined}
                  >
                    {text}
                  </div>
                  {i === 0 && <span className="shrink-0 pb-1 text-xs italic text-muted-foreground">dit-il.</span>}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); setColorPickerOpen(true); }}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-soft px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span
                className="size-3 shrink-0 rounded-full border border-border/60"
                style={bubbleColor ? { backgroundColor: bubbleColor } : undefined}
              >
                {!bubbleColor && <Pipette className="m-auto size-2.5 text-muted-foreground" />}
              </span>
              {t("colorChoose")}
            </button>
          </div>
        );
      case "sms":
        return (
          <div className="flex w-full flex-col gap-1.5">
            <div className="flex items-end justify-end gap-1.5">
              <div className="rounded-xl rounded-br-[3px] bg-primary/15 px-3 py-1.5 text-sm">Salut !</div>
            </div>
            <div className="flex items-end justify-end gap-1.5">
              <div className="rounded-xl rounded-tr-[3px] bg-primary/15 px-3 py-1.5 text-sm">Ça va ?</div>
            </div>
            <div className="flex items-end justify-start gap-1.5">
              <div className="rounded-xl rounded-tl-[3px] bg-muted px-3 py-1.5 text-sm">Oui, et toi ?</div>
            </div>
          </div>
        );
      case "privateNote":
        return (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-card px-4 py-3 text-sm text-muted-foreground">
            <Lock className="h-5 w-5 shrink-0" />
            Visible par vous seul(e)
          </div>
        );
      case "contentWarning":
        return (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-border-soft bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{t("contentWarning")}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[t("contentWarningExample1"), t("contentWarningExample2")].map((tag) => (
                <span key={tag} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={t("insertBlock")}
            className={cn("relative size-9 rounded-full shrink-0 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border-soft"
            )}
          >
            <Component className="h-4 w-4" />
            {activeOptionsCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground leading-none">
                {activeOptionsCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-[calc(100vw-2rem)] max-w-[520px] p-0 overflow-hidden sm:w-[520px]">
          <div className="flex max-h-[24rem]">
            <div className="min-w-0 flex-1 overflow-y-auto p-2 sm:border-r sm:border-border-soft">
              <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("menuBlocksSection")}
              </div>
              {blockItems.map((item) => (
                <ComposerMenuRow key={item.id} item={item} isActive={activeItemId === item.id} onHover={() => setActiveItemId(item.id)} />
              ))}
              <div className="px-2 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("menuOptionsSection")}
              </div>
              {optionItems.map((item) => (
                <ComposerMenuRow key={item.id} item={item} isActive={activeItemId === item.id} onHover={() => setActiveItemId(item.id)} />
              ))}
            </div>

            <div className="hidden w-52 shrink-0 flex-col p-4 sm:flex">
              {activeItem && (
                <>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <activeItem.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{activeItem.title}</span>
                  </div>
                  <div className="mb-3 flex flex-1 items-center justify-center">
                    {renderPreview(activeItem.id)}
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{activeItem.description}</p>
                </>
              )}
            </div>
          </div>
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
                <DialogTitle className="text-sm">{t("dialogColorTitle")}</DialogTitle>
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
                  {t("colorReset")}
                </button>
                <Button size="sm" onClick={() => setColorPickerOpen(false)}>
                  {t("colorConfirm")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {worldTimelineConfig && (
        <Dialog open={activeTool === "timeline"} onOpenChange={(v) => !v && setActiveTool(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("timelineTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-sm text-muted-foreground">
                  {worldTimelineConfig.year_label}
                  {worldTimelineConfig.era_name && <span className="ml-1 text-muted-foreground/60">{worldTimelineConfig.era_name}</span>}
                </label>
                <input
                  type="number"
                  className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
                  value={draftDate.year}
                  onChange={(e) => setDraftDate((d) => ({ ...d, year: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
              {worldTimelineConfig.month_names.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="w-24 shrink-0 text-sm text-muted-foreground">{t("month")}</label>
                  <select
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    value={draftDate.month ?? ""}
                    onChange={(e) => setDraftDate((d) => ({ ...d, month: e.target.value === "" ? null : Number(e.target.value), day: null }))}
                  >
                    <option value="">—</option>
                    {worldTimelineConfig.month_names.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
              {draftDate.month !== null && (
                <div className="flex items-center gap-3">
                  <label className="w-24 shrink-0 text-sm text-muted-foreground">{t("day")}</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="—"
                    className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
                    value={draftDate.day ?? ""}
                    onChange={(e) => setDraftDate((d) => ({ ...d, day: e.target.value ? Math.min(31, Math.max(1, parseInt(e.target.value, 10))) : null }))}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              {timelineDate && (
                <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => { onTimelineDateChange?.(null); setActiveTool(null); }}>
                  {t("removeDate")}
                </Button>
              )}
              <Button size="sm" onClick={() => { onTimelineDateChange?.(draftDate); setActiveTool(null); }}>
                {t("colorConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mapPins && mapPins.length > 0 && (
        <Dialog open={activeTool === "location"} onOpenChange={(v) => !v && setActiveTool(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("locationTitle")}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-64">
              <div className="space-y-1 py-1">
                {mapPins.map(pin => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => setDraftPinId(pin.id === draftPinId ? null : pin.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${draftPinId === pin.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                      }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} />
                    {pin.title}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              {mapPinId && (
                <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => { onMapPinChange?.(null); setActiveTool(null); }}>
                  {t("removeLocation")}
                </Button>
              )}
              <Button size="sm" onClick={() => { onMapPinChange?.(draftPinId); setActiveTool(null); }}>
                {t("colorConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <DiceDialog
        open={activeTool === "dice"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <CalloutDialog
        open={activeTool === "callout"}
        onOpenChange={(v) => { if (!v) { setActiveTool(null); onCalloutClose?.(); } }}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
        onUploadIconImage={onUploadIconImage}
      />
      <NarrativeBlockDialog
        blockType="reveal"
        open={activeTool === "reveal"}
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
      <AnchorDialog
        open={activeTool === "anchor"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
      <ChoiceDialog
        open={activeTool === "choice"}
        onOpenChange={(v) => !v && setActiveTool(null)}
        onSend={(content) => { onSend(content); setActiveTool(null); }}
      />
    </>
  );
}
