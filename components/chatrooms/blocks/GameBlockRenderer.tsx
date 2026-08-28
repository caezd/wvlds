"use client";

import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { toWebP } from "@/lib/imageUtils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { applyOwnVote } from "@/lib/choiceVotes";
import type { ChatBlock } from "@/lib/chat-blocks";
import type { ChatMessageMeta, ChoiceVoteSummary } from "@/types/db";

import { DiceMessageView } from "./DiceMessageView";
import { BannerBlockView } from "./BannerBlock";
import { RevealBlockView } from "./RevealBlock";
import { NpcBlockView } from "./NpcBlock";
import { HpBlockView } from "./HpBlock";
import { CalloutBlockView } from "./CalloutBlock";
import { AnchorBlockView } from "./AnchorBlockView";
import { ChoiceBlockView } from "./ChoiceBlock";
import { useTranslations } from "next-intl";

/**
 * Aiguilleur unique des blocs de jeu d'un message. Centralise la plomberie
 * commune (chiffrement, mise à jour / suppression en base, toasts d'erreur)
 * et l'espacement extérieur de chaque bloc, puis délègue le rendu au composant
 * dédié. Ajouter un nouveau type de bloc = un `case` ici + son composant de vue.
 */
export function GameBlockRenderer({
  block,
  mine,
  label,
  message,
  chatroomKey,
  onUpdated,
  onAnchorEdited,
  votes,
  onVotesUpdated,
}: {
  block: ChatBlock;
  mine: boolean;
  label: string;
  message: { id: number; content?: string | null; chat_id?: string; metadata?: ChatMessageMeta | null };
  chatroomKey?: string | null;
  onUpdated?: (id: number, content: string, metadata: ChatMessageMeta | null) => void;
  onAnchorEdited?: (messageId: number, label: string) => void;
  /** Résumé des votes du bloc "choice" (ignoré pour les autres types de bloc). */
  votes?: ChoiceVoteSummary[];
  onVotesUpdated?: (messageId: number, votes: ChoiceVoteSummary[]) => void;
}) {
  const tCommon = useTranslations("common");
  const tChatrooms = useTranslations("chatrooms");
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const pendingIconMediaRef = useRef<{ url: string; name: string }[]>([]);

  // Édition : (ré)écrit le contenu JSON du bloc, chiffré si une clé est fournie.
  const editBlock = async (content: string) => {
    const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
    const { error } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .update({ content: encrypted })
      .eq("id", message.id);
    if (error) {
      toast.error(tCommon("editFailed"), { description: error.message });
      return;
    }
    onUpdated?.(message.id, content, message.metadata ?? null);
  };

  // Édition d'un CalloutBlock : fusionne les images uploadées pendant l'édition
  // dans la metadata.media du message, en plus de réécrire le contenu.
  const editCalloutBlock = async (content: string) => {
    const pending = pendingIconMediaRef.current;
    pendingIconMediaRef.current = [];

    if (pending.length === 0) {
      await editBlock(content);
      return;
    }

    const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
    const { data } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .select("metadata")
      .eq("id", message.id)
      .single();

    const currentMeta = (data?.metadata as Record<string, unknown>) ?? {};
    const currentMedia = (currentMeta.media as { url: string; name: string }[]) ?? [];
    const newMeta = { ...currentMeta, media: [...currentMedia, ...pending] };

    const { error } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .update({ content: encrypted, metadata: newMeta })
      .eq("id", message.id);
    if (error) {
      toast.error(tCommon("editFailed"), { description: error.message });
      return;
    }
    onUpdated?.(message.id, content, newMeta as ChatMessageMeta);
  };

  // Upload d'image vers le bucket chat-media pour l'icône d'un CalloutBlock.
  const uploadIconImage = message.chat_id
    ? async (file: File): Promise<string | null> => {
        const converted = await toWebP(file);
        const path = `${message.chat_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
        const { error } = await supabase.storage
          .from("chat-media")
          .upload(path, converted, { contentType: "image/webp" });
        if (error) {
          toast.error(tCommon("uploadImageError"), { description: error.message });
          return null;
        }
        const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
        pendingIconMediaRef.current = [
          ...pendingIconMediaRef.current,
          { url: data.publicUrl, name: file.name },
        ];
        return data.publicUrl;
      }
    : undefined;

  // Vote sur un bloc "choice" : upsert (clé (message_id, user_id)) donc un
  // revote met simplement à jour la ligne existante. Optimiste côté appelant
  // via applyOwnVote — la RLS refuse silencieusement (aucune ligne affectée)
  // si l'utilisateur est l'auteur du message.
  const castVote = async (optionId: string) => {
    if (!userId || !message.chat_id) return;
    const previousVotes = votes ?? [];
    onVotesUpdated?.(message.id, applyOwnVote(previousVotes, optionId));
    const { error } = await supabase.from(TABLE.CHAT_CHOICE_VOTES).upsert(
      { message_id: message.id, chat_id: message.chat_id, option_id: optionId, user_id: userId },
      { onConflict: "message_id,user_id" },
    );
    if (error) {
      toast.error(tChatrooms("voteFailed"), { description: error.message });
      onVotesUpdated?.(message.id, previousVotes);
    }
  };

  // Suppression : `noun` sert au message d'erreur, `before` permet un nettoyage
  // préalable optionnel (ex. retrait du fichier de bannière dans le storage).
  const deleteBlock =
    (noun: string, before?: () => Promise<void>) => async () => {
      if (before) {
        try {
          await before();
        } catch {
          /* nettoyage non-bloquant */
        }
      }
      const { error } = await supabase
        .from(TABLE.CHAT_MESSAGES)
        .delete()
        .eq("id", message.id);
      if (error) toast.error(`Impossible de supprimer ${noun} : ` + error.message);
    };

  switch (block._type) {
    case "dice":
      return (
        <DiceMessageView
          block={block}
          label={label}
          mine={mine}
          onEditLabel={(newLabel) =>
            editBlock(JSON.stringify({ ...block, label: newLabel || undefined }))
          }
          onDelete={deleteBlock("le lancé")}
        />
      );

    case "banner":
      return (
        <div className="py-8">
          <BannerBlockView
            block={block}
            mine={mine}
            onDelete={deleteBlock("la bannière", async () => {
              const pathMatch = block.url.match(/\/chat-banners\/(.+)$/);
              if (pathMatch?.[1]) {
                await supabase.storage.from("chat-banners").remove([pathMatch[1]]);
              }
            })}
          />
        </div>
      );

    case "reveal":
      return (
        <div className="py-8">
          <RevealBlockView
            block={block}
            mine={mine}
            onEdit={editBlock}
            onDelete={deleteBlock("la révélation")}
          />
        </div>
      );

    case "npc":
      return (
        <div className="py-8">
          <NpcBlockView
            block={block}
            mine={mine}
            onEdit={editBlock}
            onDelete={deleteBlock("la fiche PNJ")}
          />
        </div>
      );

    case "hp":
      return (
        <div className="py-8">
          <HpBlockView
            block={block}
            mine={mine}
            onEdit={editBlock}
            onDelete={deleteBlock("la jauge de vie")}
          />
        </div>
      );

    case "callout":
      return (
        <div className="py-8">
          <CalloutBlockView
            block={block}
            mine={mine}
            onEdit={editCalloutBlock}
            onDelete={deleteBlock("l'encadré")}
            onUploadIconImage={uploadIconImage}
          />
        </div>
      );

    case "choice":
      return (
        <div className="py-8">
          <ChoiceBlockView
            block={block}
            mine={mine}
            votes={votes ?? []}
            onVote={castVote}
            onEdit={editBlock}
            onDelete={deleteBlock("le choix")}
          />
        </div>
      );

    case "anchor":
      return (
        <AnchorBlockView
          block={block}
          mine={mine}
          onEdit={async (newLabel) => {
            await editBlock(JSON.stringify({ ...block, label: newLabel }));
            onAnchorEdited?.(message.id, newLabel);
          }}
          onDelete={deleteBlock("l'ancre")}
        />
      );

    default:
      return null;
  }
}
