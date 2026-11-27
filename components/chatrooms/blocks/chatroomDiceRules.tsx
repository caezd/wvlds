"use client";

import * as React from "react";

import type { DiceMode } from "@/lib/worldDice";

/**
 * Les règles des dés du monde d'un salon (migration 270), posées une fois par
 * la vue du salon : la fenêtre « Lancer un dé » et l'affichage des lancers les
 * lisent sans qu'elles traversent le fil et le composeur.
 *
 * Hors d'un salon (aperçus), les règles par défaut : formules libres, lancers
 * figés, ni critique ni échec critique (migration 273).
 */
export type ChatroomDiceRules = {
  worldId: string | null;
  mode: DiceMode;
  allowEdit: boolean;
  critical: boolean;
  fumble: boolean;
};

const DEFAULT_RULES: ChatroomDiceRules = { worldId: null, mode: "free", allowEdit: false, critical: false, fumble: false };

const ChatroomDiceRulesContext = React.createContext<ChatroomDiceRules>(DEFAULT_RULES);

export function ChatroomDiceRulesProvider({ value, children }: { value: ChatroomDiceRules; children: React.ReactNode }) {
  const { worldId, mode, allowEdit, critical, fumble } = value;
  const memo = React.useMemo(
    () => ({ worldId, mode, allowEdit, critical, fumble }),
    [worldId, mode, allowEdit, critical, fumble],
  );
  return <ChatroomDiceRulesContext.Provider value={memo}>{children}</ChatroomDiceRulesContext.Provider>;
}

export function useChatroomDiceRules(): ChatroomDiceRules {
  return React.useContext(ChatroomDiceRulesContext);
}
