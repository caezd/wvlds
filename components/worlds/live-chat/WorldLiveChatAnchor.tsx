"use client";

import { useEffect } from "react";
import { registerLiveChatWorld } from "@/lib/worldLiveChatStore";

/**
 * Déclare le monde courant à la barre de chat en direct (cf.
 * lib/worldLiveChatStore.ts). Monté par les layouts `/w/[id]` et `/c/[id]`,
 * pour les seuls membres d'un monde qui a activé sa chatbox. Dans un salon,
 * il déclare aussi le salon : la chatbox y ouvre son fil (migration 238).
 */
export function WorldLiveChatAnchor({
  worldId,
  chatroom = null,
}: {
  worldId: string;
  chatroom?: { id: string; title: string } | null;
}) {
  const chatroomId = chatroom?.id ?? null;
  const chatroomTitle = chatroom?.title ?? null;
  useEffect(
    () => registerLiveChatWorld(worldId, chatroomId ? { id: chatroomId, title: chatroomTitle ?? "" } : null),
    [worldId, chatroomId, chatroomTitle],
  );
  return null;
}
