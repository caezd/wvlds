"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { toast } from "sonner";
import { TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";

/**
 * Composer affiché sur la page d'accueil d'un monde pour créer une nouvelle
 * chatroom avec son premier message. Adaptateur mince autour du composer
 * universel (ChatroomComposer) : toute amélioration de ce dernier est donc
 * automatiquement reflétée ici.
 */
export function WorldChatComposer({ worldId }: { worldId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const [persona, setPersona] = useState<Persona | null>(null);

  async function resolveChat(): Promise<{ chatId: string } | null> {
    if (!userId) {
      toast.error("Vous devez être connecté.");
      return null;
    }
    const title = (() => {
      try { return generate({ words: 2 }).spaced; }
      catch { return "Conversation"; }
    })();

    const { data: room, error } = await supabase
      .from(TABLE.CHATROOMS)
      .insert({ world_id: worldId, title, created_by: userId })
      .select("id")
      .single();

    if (error || !room) {
      toast.error(error?.message ?? "Impossible de créer la chatroom.");
      return null;
    }
    return { chatId: room.id };
  }

  return (
    <ChatroomComposer
      presetPersona={persona}
      onPersonaChange={setPersona}
      placeholder="Nouveau jeu…"
      onResolveChat={resolveChat}
      onAfterSend={(chatId) => router.push(`/c/${chatId}`)}
    />
  );
}
