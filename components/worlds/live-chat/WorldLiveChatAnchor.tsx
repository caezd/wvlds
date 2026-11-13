"use client";

import { useEffect } from "react";
import { registerLiveChatWorld } from "@/lib/worldLiveChatStore";

/**
 * Déclare le monde courant à la barre de chat en direct (cf.
 * lib/worldLiveChatStore.ts). Monté par les layouts `/w/[id]` et `/c/[id]`,
 * pour les seuls membres du monde.
 */
export function WorldLiveChatAnchor({ worldId }: { worldId: string }) {
  useEffect(() => registerLiveChatWorld(worldId), [worldId]);
  return null;
}
