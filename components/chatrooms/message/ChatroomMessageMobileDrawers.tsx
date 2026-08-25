"use client";

import { useTranslations } from "next-intl";
import { Code, FileText, Pencil, Pipette, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChatReactionPicker } from "../reactions/ChatReactionPicker";
import { markdownToPlainText } from "@/lib/markdownToPlainText";

async function copyToClipboard(text: string, successMessage: string, errorMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
  }
}

/** Drawers mobiles (long-press) : options du message, puis picker d'emoji. */
export function ChatroomMessageMobileDrawers({
  personaName,
  mine,
  content,
  dialogueColor,
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
  content: string;
  /** Couleur de bulle du message (mode "Dialogues en bulles" actif) — affiche
   *  l'option de copie dans le drawer si définie. */
  dialogueColor?: string | null;
  emojiReactions?: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  emojiPickerOpen: boolean;
  setEmojiPickerOpen: (open: boolean) => void;
  startEdit: () => void;
  onRequestDelete?: () => void;
  toggleReaction: (emoteKey: string) => void | Promise<void>;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");

  return (
    <>
      {/* Drawer mobile — liste d'options (long-press) */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-center text-sm font-medium text-muted-foreground">
              {personaName ?? t("actions")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("mobileOptionsDescription")}
            </DrawerDescription>
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
                {t("react")}
              </button>
            )}
            <button
              type="button"
              className="flex items-center gap-4 px-6 py-4 text-left text-base hover:bg-muted/50 transition-colors"
              onClick={() => {
                setDrawerOpen(false);
                void copyToClipboard(markdownToPlainText(content), t("copyTextSuccess"), t("copyError"));
              }}
            >
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              {t("copyText")}
            </button>
            <button
              type="button"
              className="flex items-center gap-4 px-6 py-4 text-left text-base hover:bg-muted/50 transition-colors"
              onClick={() => {
                setDrawerOpen(false);
                void copyToClipboard(content, t("copyMarkdownSuccess"), t("copyError"));
              }}
            >
              <Code className="h-5 w-5 shrink-0 text-muted-foreground" />
              {t("copyMarkdown")}
            </button>
            {dialogueColor && (
              <button
                type="button"
                className="flex items-center gap-4 px-6 py-4 text-left text-base hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setDrawerOpen(false);
                  void copyToClipboard(dialogueColor, t("copyDialogueColorSuccess"), t("copyError"));
                }}
              >
                <Pipette className="h-5 w-5 shrink-0 text-muted-foreground" />
                {t("copyDialogueColor")}
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
                  {tCommon("edit")}
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
                  {tCommon("delete")}
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
              {t("react")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("mobileReactionDescription")}
            </DrawerDescription>
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
