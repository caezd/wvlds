"use client";

import { Pencil, SmilePlus, Trash2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChatReactionPicker } from "../reactions/ChatReactionPicker";

/** Drawers mobiles (long-press) : options du message, puis picker d'emoji. */
export function ChatroomMessageMobileDrawers({
  personaName,
  mine,
  emojiReactions,
  drawerOpen,
  setDrawerOpen,
  emojiPickerOpen,
  setEmojiPickerOpen,
  startEdit,
  onRequestDelete,
  toggleReaction,
}: {
  personaName?: string | null;
  mine: boolean;
  emojiReactions?: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  emojiPickerOpen: boolean;
  setEmojiPickerOpen: (open: boolean) => void;
  startEdit: () => void;
  onRequestDelete?: () => void;
  toggleReaction: (emoteKey: string) => void | Promise<void>;
}) {
  return (
    <>
      {/* Drawer mobile — liste d'options (long-press) */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-center text-sm font-medium text-muted-foreground">
              {personaName ?? "Options"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col pb-6">
            {emojiReactions && (
              <button
                type="button"
                className="flex items-center gap-4 px-6 py-4 text-left text-base hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setDrawerOpen(false);
                  setTimeout(() => setEmojiPickerOpen(true), 200);
                }}
              >
                <SmilePlus className="h-5 w-5 shrink-0 text-muted-foreground" />
                Réagir
              </button>
            )}
            {mine && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-4 px-6 py-4 text-left text-base hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setDrawerOpen(false);
                    startEdit();
                  }}
                >
                  <Pencil className="h-5 w-5 shrink-0 text-muted-foreground" />
                  Modifier
                </button>
                <button
                  type="button"
                  className="flex items-center gap-4 px-6 py-4 text-left text-base text-destructive hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setDrawerOpen(false);
                    onRequestDelete?.();
                  }}
                >
                  <Trash2 className="h-5 w-5 shrink-0" />
                  Supprimer
                </button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Drawer mobile — picker d'emoji (séparé du drawer options) */}
      <Drawer open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-center text-sm font-medium text-muted-foreground">
              Réagir
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <ChatReactionPicker
              onSelect={(emoji) => {
                void toggleReaction(emoji);
                setEmojiPickerOpen(false);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
