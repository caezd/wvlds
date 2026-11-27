"use client";

import * as React from "react";

import type { ChatroomDay } from "@/lib/chatroomDay";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

/**
 * Le temps du salon (migration 275), posé une fois par la vue du salon : la
 * fenêtre « Ellipse » et l'affichage des ellipses le lisent sans qu'il
 * traverse le fil et le composeur. Hors d'un salon, rien.
 */
export type ChatroomTime = {
  /** La chronologie du monde, quand elle est active. */
  config: WorldTimelineConfig | null;
  /** La date de début du salon. */
  startDate: WorldTimelineDate | null;
  /** Sa date d'avancée, posée par les ellipses. */
  currentDate: WorldTimelineDate | null;
  day: ChatroomDay | null;
};

const EMPTY: ChatroomTime = { config: null, startDate: null, currentDate: null, day: null };

const ChatroomTimeContext = React.createContext<ChatroomTime>(EMPTY);

export function ChatroomTimeProvider({ value, children }: { value: ChatroomTime; children: React.ReactNode }) {
  return <ChatroomTimeContext.Provider value={value}>{children}</ChatroomTimeContext.Provider>;
}

export function useChatroomTime(): ChatroomTime {
  return React.useContext(ChatroomTimeContext);
}
