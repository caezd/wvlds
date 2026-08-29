"use client";

import React, { useState, useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { getInitials } from "@/lib/textFormatting";
import type { Persona } from "@/types/db";
import { TABLE, RPC } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTagChips } from "@/hooks/useTagChips";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { ContentWarningChipInput } from "@/components/chatrooms/composer/ContentWarningChipInput";
import { Button } from "../../ui/button";
import { SendHorizontal, X, Lock, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toWebP } from "@/lib/imageUtils";
import { nomDeFichierPourType, nomDeFichierUnique } from "@/lib/storagePaths";
import { ImagePickerCropField } from "@/components/ui/image-crop-picker";
import { ParagraphBlockEditor } from "./ParagraphBlockEditor";
import {
    computeWordCount,
    extractMentions,
    buildVisibleToLabels,
    buildMessageMetadata,
    shouldApplyContentWarnings,
} from "@/lib/composerMessage";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerContent,
    DrawerTitle,
    DrawerDescription,
    DrawerTrigger,
} from "@/components/ui/drawer";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";


// Le menu des blocs et ses sept dialogues vivent dans `./BlocksDropdown` :
// 692 lignes qui n'utilisaient rien du composeur.
import { BlocksDropdown, type MapPinOption } from "./BlocksDropdown";
import { getUsablePersonaIds } from "@/lib/personaEligibility";

type ChatroomComposerProps = {
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
    /** Sur mobile, étire la carte du composer en pleine hauteur (éditeur
     *  flex-1) même quand le composer n'utilise pas son propre Drawer interne
     *  (mode création) — à passer quand le parent héberge déjà le composer
     *  dans son propre drawer plein écran (ex: WorldChatComposer). */
    fillHeight?: boolean;
};

/** Permet au parent (ex: dialog de création) de vider le composer et son
 *  brouillon persisté — utilisé quand l'utilisateur annule/ferme sans envoyer. */
export type ChatroomComposerHandle = {
    clearDraft: () => void;
};

export const ChatroomComposer = forwardRef<ChatroomComposerHandle, ChatroomComposerProps>(function ChatroomComposer({
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
    fillHeight = false,
}, ref) {
    const tChatrooms = useTranslations("chatrooms");
    const tCommon = useTranslations("common");
    const tPersonas = useTranslations("personas");
    const tDms = useTranslations("dms");
    const supabase = useMemo(() => createClient(), []);
    const { userId, username, plan } = useCurrentUser();
    const inFlightRef = useRef(false);
    const pendingBlockMediaRef = useRef<{ url: string; name: string }[]>([]);

    // Sur mobile (clavier virtuel), Maj+Entrée n'est pas accessible : on inverse
    // le rôle d'Entrée dans le composer (cf. ParagraphBlockEditor `invertEnter`).
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(window.matchMedia("(pointer: coarse)").matches);
    }, []);
    // Sur mobile, le composeur complet ne s'affiche qu'à la demande, dans un
    // drawer bottom (barre compacte sinon) — cf. `composerCard` plus bas.
    //
    // Exception : en mode « création » (onResolveChat fourni), le composer est
    // déjà rendu à l'intérieur d'un Dialog (ex: WorldChatComposer). Empiler
    // notre propre Drawer (position: fixed) dans ce Dialog transformé casse
    // son containing block — le drawer se retrouve mal positionné/inatteignable
    // et l'éditeur devient impossible à focus. On reste donc en rendu inline
    // dans ce cas, même sur mobile.
    const useMobileDrawer = isMobile && !onResolveChat;
    // Habillage « pleine hauteur » de la carte (grid/flex étirés, éditeur
    // flex-1…) : s'applique quand on utilise notre propre drawer, mais aussi
    // quand le parent signale via `fillHeight` qu'il héberge déjà le composer
    // dans SON propre drawer plein écran (mode création) — dissocié de
    // `useMobileDrawer`, qui ne doit rester vrai que pour éviter d'imbriquer
    // un second Drawer.
    const stretchCard = useMobileDrawer || (isMobile && fillHeight);
    const [drawerOpen, setDrawerOpen] = useState(false);

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
    // Aperçus des images en attente d'envoi, mémorisés par fichier.
    //
    // Ces URL étaient créées à chaque rendu — or ce composant se re-rend à
    // chaque frappe (il porte l'état `value`). Écrire un message avec trois
    // images attachées fabriquait donc trois `blob:` par caractère tapé, aucune
    // n'étant jamais révoquée : chacune retient son fichier en mémoire jusqu'au
    // rechargement de la page.
    //
    // Le cache est indexé par l'objet `File` lui-même, pas par sa position :
    // un même fichier garde son URL d'un rendu à l'autre, donc aucune vignette
    // ne clignote à l'ajout ou au retrait d'une image. La création reste
    // idempotente, ce qui la rend sûre en mode strict (double rendu en
    // développement).
    const previewUrlsRef = useRef(new Map<File, string>());
    const pendingMediaPreviews = pendingMedia.map((file) => {
        let url = previewUrlsRef.current.get(file);
        if (!url) {
            url = URL.createObjectURL(file);
            previewUrlsRef.current.set(file, url);
        }
        return url;
    });

    // Libère les URL des fichiers retirés de la liste, puis tout au démontage.
    useEffect(() => {
        const stillPending = new Set(pendingMedia);
        for (const [file, url] of previewUrlsRef.current) {
            if (stillPending.has(file)) continue;
            URL.revokeObjectURL(url);
            previewUrlsRef.current.delete(file);
        }
    }, [pendingMedia]);
    useEffect(() => {
        const cache = previewUrlsRef.current;
        return () => {
            for (const url of cache.values()) URL.revokeObjectURL(url);
            cache.clear();
        };
    }, []);
    // Initialiser à null pour que le rendu SSR corresponde au premier rendu
    // client : `presetPersona` vient in fine de préférences résolues côté
    // parent, et rien ne garantit qu'elles soient déjà stables au moment de
    // l'hydratation — un mismatch ici se traduisait par l'attribut `disabled`
    // du bouton d'envoi qui diverge entre le HTML serveur et le premier rendu
    // client (canSend dépend de selectedPersona). Même garde-fou que `value`
    // ci-dessus.
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
    // Ids des personas utilisables pour poster (plan gratuit : les 5 plus
    // anciens du monde, cf. migration 090 / lib/personaEligibility.ts). `null`
    // tant que non résolu — on ne bloque alors pas l'envoi par prudence (la
    // vraie barrière est de toute façon la RLS/le trigger côté base).
    const [usableIds, setUsableIds] = useState<Set<string> | null>(null);
    useEffect(() => {
        if (!userId || !worldId) { setUsableIds(null); return; }
        let cancelled = false;
        supabase
            .from(TABLE.PERSONAS)
            .select("id, created_at, is_template")
            .eq("user_id", userId)
            .eq("world_id", worldId)
            .then(({ data }: { data: { id: string; created_at: string; is_template: boolean }[] | null }) => {
                if (cancelled) return;
                setUsableIds(getUsablePersonaIds(data ?? [], plan));
            });
        return () => { cancelled = true; };
    }, [supabase, userId, worldId, plan]);
    const BUBBLE_KEY = `bubbleMode:${chatId ?? "new"}`;
    const BUBBLE_COLOR_KEY = `bubbleColor:${chatId ?? "new"}`;
    const [bubbleMode, setBubbleModeRaw] = useState(false);
    const [bubbleColor, setBubbleColorRaw] = useState<string | null>(null);
    useEffect(() => {
        setSelectedPersona(presetPersona);
        try { setBubbleModeRaw(localStorage.getItem(BUBBLE_KEY) === "1"); } catch { }
        // La couleur du persona (si définie) prend le pas sur le dernier choix
        // mémorisé pour cette chatroom.
        if (presetPersona?.dialogue_color) {
            setBubbleColorRaw(presetPersona.dialogue_color);
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
        const previousColor = bubbleColor;
        setBubbleColor(v);
        if (selectedPersona) {
            const previousPersona = selectedPersona;
            setSelectedPersona((prev) => (prev ? { ...prev, dialogue_color: v } : prev));
            // Sans lire l'erreur, la couleur restait appliquée à l'écran et
            // revenait à l'ancienne au rechargement, sans explication.
            const { error } = await supabase
                .from(TABLE.PERSONAS)
                .update({ dialogue_color: v })
                .eq("id", selectedPersona.id);
            if (error) {
                setBubbleColor(previousColor);
                setSelectedPersona(previousPersona);
                toast.error(error.message);
            }
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

    useImperativeHandle(ref, () => ({
        clearDraft() {
            if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
            setValue("");
            setPendingMedia([]);
            setVisibleTo(null);
            setParticipants([]);
            contentWarningsChips.reset(null);
            try { localStorage.removeItem(DRAFT_KEY); } catch { }
        },
    }));

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
            if (error) { toast.error(tCommon("uploadBannerError"), { description: error.message }); return; }
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
        // En parallèle plutôt qu'en série : joindre quatre images enchaînait
        // quatre cycles compression + envoi, chacun attendant le précédent.
        // `toWebP` compresse dans un web worker (browser-image-compression),
        // l'interface ne bloque donc pas. `Promise.all` conserve l'ordre du
        // tableau, et un échec isolé laisse simplement passer les autres —
        // comme le `continue` d'avant.
        const settled = await Promise.all(
            files.map(async (rawFile): Promise<{ url: string; name: string } | null> => {
                const file = await toWebP(rawFile);
                const path = `${targetChatId}/${nomDeFichierPourType(file.type)}`;
                const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type });
                if (error) { toast.error(tCommon("uploadImageError"), { description: error.message }); return null; }
                const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
                return { url: data.publicUrl, name: file.name };
            }),
        );
        return settled.filter((r): r is { url: string; name: string } => r !== null);
    }

    async function uploadIconImageForBlock(file: File): Promise<string | null> {
        if (!chatId) {
            toast.error(tChatrooms("pickRoomFirst"));
            return null;
        }
        const converted = await toWebP(file);
        const path = `${chatId}/${nomDeFichierUnique("webp")}`;
        const { error } = await supabase.storage
            .from("chat-media")
            .upload(path, converted, { contentType: "image/webp" });
        if (error) { toast.error(tCommon("uploadImageError"), { description: error.message }); return null; }
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
            toast.warning(tChatrooms("pickRecipient"));
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
            if (error) { toast.error(tChatrooms("sendFailed"), { description: error.message }); return false; }
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
                            // Le message est publié : c'est l'essentiel, et
                            // échouer ici ne doit pas le remettre en cause.
                            // Mais une mention qui n'alerte personne passe
                            // pour une mention reçue — on la trace.
                            const { error: mentionError } = await supabase.from(TABLE.NOTIFICATIONS).insert(
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
                            if (mentionError) console.error("[mentions] notifications non créées", mentionError.message);
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
            if (useMobileDrawer) setDrawerOpen(false);
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

    const selectedPersonaLocked = !!selectedPersona && !!usableIds && !usableIds.has(selectedPersona.id);
    const canSend =
        (value.trim().length > 0 || pendingMedia.length > 0) && !!selectedPersona && !selectedPersonaLocked;

    const typingBanner = (
        // Languette « en train d'écrire » : cachée derrière le composer (fond
        // opaque qui la masque), elle glisse vers le haut pour dépasser au-dessus
        // quand quelqu'un écrit.
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
    );

    const composerCard = (
        <div
            className={cn(
                "relative z-10 cursor-text overflow-clip p-2 contain-inline-size bg-background border flex flex-col rounded-lg",
                smsMode ? "border-mist-200 rounded-tr-[18px] rounded-bl-[18px] rounded-br-[18px]" : "border",
                // Dans le drawer mobile, la carte occupe toute la hauteur dispo —
                // le bloc "content" ci-dessous s'étire pour la remplir, le footer
                // (actions/envoi) garde sa taille naturelle. Sur desktop,
                // comportement inchangé (hauteur au contenu).
                stretchCard && "h-full",
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

            {/* Content : bandeaux d'en-tête + éditeur — grandit pour remplir la
            carte (mobile) ; le footer plus bas garde sa hauteur naturelle. */}
            <div className={cn("flex flex-col", stretchCard && "flex-1 min-h-0")}>
                {/* Bandeaux d'en-tête (note privée / avertissements / médias collés) :
            un seul conteneur — sinon ces blocs, indépendants les uns des
            autres, se superposeraient au lieu de s'empiler quand plusieurs
            sont actifs en même temps. */}
                {(visibleTo !== null || contentWarningsChips.tags !== null || pendingMedia.length > 0) && (
                    <div className="flex flex-col">
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
                                    <span className="text-xs text-muted-foreground italic">{tChatrooms("noOtherParticipant")}</span>
                                )}
                                <button
                                  aria-label={tCommon("remove")}
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
                                          aria-label={tCommon("remove")}
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
                <div className={cn(
                    "flex min-h-10 items-start overflow-hidden group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5",
                    // `items-start` (défaut) laisse l'enfant se dimensionner à son
                    // contenu — sur mobile on veut au contraire qu'il s'étire pour
                    // remplir l'espace restant du bloc "content", d'où `items-stretch`.
                    stretchCard && "flex-1 min-h-0 items-stretch",
                )}>
                    <div className={cn("flex-1", stretchCard && "flex flex-col min-h-0")}>
                        <ParagraphBlockEditor
                            value={value}
                            onChange={(v) => { setValue(v); onTyping?.(); }}
                            onKeyDown={onKeyDown}
                            placeholder={placeholder}
                            className="text-sm w-full"
                            // Desktop : grandit avec le contenu jusqu'à 50vh puis scrolle
                            // en interne (au lieu du plafond par défaut, plus petit).
                            wrapperClassName={stretchCard ? "flex-1 min-h-0 max-h-none" : "max-h-[50vh]"}
                            invertEnter={isMobile}
                            autoFocus={stretchCard}
                            formatting
                        />
                    </div>
                </div>
            </div>

            {/* Footer : sélecteur de persona, actions et bouton d'envoi — taille
            fixée à son contenu (jamais étiré), toujours en bas de carte. */}
            <div className="flex shrink-0 items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <PersonaPickerDialog
                        selected={selectedPersona}
                        onSelect={async (p) => {
                            setSelectedPersona(p);
                            setBubbleColor(p?.dialogue_color ?? null);
                            onPersonaChange?.(p);
                            if (p && userId && chatId) {
                                // Le persona est bien sélectionné pour la
                                // session en cours ; seule sa mémorisation
                                // d'une visite à l'autre peut échouer.
                                const { error } = await supabase.from(TABLE.CHATROOM_PERSONA_PREFS).upsert(
                                    { chat_id: chatId, user_id: userId, persona_id: p.id },
                                    { onConflict: "chat_id,user_id" },
                                );
                                if (error) console.error("[chatroomPersonaPrefs]", error.message);
                            }
                        }}
                        required
                        userId={userId}
                        worldId={worldId}
                        variant={useMobileDrawer ? "drawer" : "dialog"}
                    />
                    <BlocksDropdown
                        variant={useMobileDrawer ? "drawer" : "dropdown"}
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

                {/* Bouton envoyer */}
                <div
                    className={cn(
                        "min-w-9 transition-transform",
                        value.trim() ? "visible scale-100" : "invisible scale-80",
                        selectedPersona ? "ml-2" : "ml-0",
                    )}
                >
                    <Button
                        size="icon"
                        className="rounded-md bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => void send()}
                        disabled={!canSend}
                        aria-disabled={!canSend}
                        title={
                            selectedPersonaLocked ? tPersonas("lockedHint")
                                : selectedPersona ? tDms("send")
                                    : tPersonas("pick")
                        }
                    >
                        <SendHorizontal />
                    </Button>
                </div>
            </div>
        </div>
    );

    const previewText = value.trim().replace(/\s+/g, " ");

    return (
        <div className={cn(
            "group/composer relative w-full [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width)",
            stretchCard && "h-full",
        )}>
            {typingBanner}

            {useMobileDrawer ? (
                <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <DrawerTrigger
                        render={
                            <button
                                type="button"
                                className="relative z-10 flex w-full items-center gap-2.5 rounded-lg border bg-background p-2 text-left shadow-sm"
                            />
                        }
                    >
                        <span className="relative size-8 shrink-0 overflow-hidden rounded-md border bg-muted">
                            {selectedPersona ? (
                                selectedPersona.avatar_url ? (
                                    <Image
                                        src={supabaseThumb(selectedPersona.avatar_url, 64) ?? selectedPersona.avatar_url}
                                        alt=""
                                        fill
                                        sizes="32px"
                                        className="object-cover"
                                    />
                                ) : (
                                    <span className="grid h-full w-full place-items-center text-[10px] font-bold text-muted-foreground">
                                        {getInitials(selectedPersona.name)}
                                    </span>
                                )
                            ) : (
                                <span className="grid h-full w-full place-items-center text-muted-foreground">
                                    <UserPlus size={14} />
                                </span>
                            )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {previewText || placeholder}
                        </span>
                        {previewText && <SendHorizontal className="size-4 shrink-0 text-primary" />}
                    </DrawerTrigger>
                    <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] [--drawer-inset:8px] p-0 border-0 rounded-lg">
                        <DrawerTitle className="sr-only">{tChatrooms("composerTitle")}</DrawerTitle>
                        <DrawerDescription className="sr-only">{placeholder}</DrawerDescription>
                        <div className="flex-1 min-h-0 p-0">
                            {composerCard}
                        </div>
                    </DrawerContent>
                </Drawer>
            ) : (
                composerCard
            )}
        </div>
    );
});
