"use client";

import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { toWebP } from "@/lib/imageUtils";
import type { ChatBlock } from "@/lib/chat-blocks";

import { DiceMessageView } from "./DiceMessageView";
import { BannerBlockView } from "./BannerBlock";
import { RevealBlockView } from "./RevealBlock";
import { NpcBlockView } from "./NpcBlock";
import { HpBlockView } from "./HpBlock";
import { CalloutBlockView } from "./CalloutBlock";
import { AnchorBlockView } from "./AnchorBlockView";

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
}: {
  block: ChatBlock;
  mine: boolean;
  label: string;
  message: { id: number; content?: string | null; chat_id?: string };
  chatroomKey?: string | null;
  onUpdated?: (id: number, content: string) => void;
  onAnchorEdited?: (messageId: number, label: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const pendingIconMediaRef = useRef<{ url: string; name: string }[]>([]);

  // Édition : (ré)écrit le contenu JSON du bloc, chiffré si une clé est fournie.
  const editBlock = async (content: string) => {
    const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
    const { error } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .update({ content: encrypted })
      .eq("id", message.id);
    if (error) {
      toast.error("Impossible de modifier : " + error.message);
      return;
    }
    onUpdated?.(message.id, content);
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
      toast.error("Impossible de modifier : " + error.message);
      return;
    }
    onUpdated?.(message.id, content);
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
          toast.error("Erreur upload image.", { description: error.message });
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
