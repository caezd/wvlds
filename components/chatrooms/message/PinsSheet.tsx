"use client";

import { useTranslations } from "next-intl";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { PinCard } from "@/components/chatrooms/message/PinBar";
import { cn } from "@/lib/utils";
import type { ChatPin, ChatMessageWithPersona } from "@/types/db";

export function PinsSheet({
  open,
  onOpenChange,
  pins,
  messages,
  onScrollToMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pins: ChatPin[];
  messages: ChatMessageWithPersona[];
  onScrollToMessage: (messageId: number) => void;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");
  const messageById = new Map(messages.map((m) => [m.id, m]));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent
        className={cn(
          "inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0",
          "w-[min(calc(100%_-_var(--drawer-inset)*2),_360px)]",
        )}
      >
        <DrawerClose
          aria-label={tCommon("close")}
          className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="size-4" />
        </DrawerClose>
        <DrawerHeader className="border-b border-border-soft px-6 py-4">
          <DrawerTitle>{t("pinsTitle")}</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {pins.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("pinsEmpty")}</p>
          ) : (
            pins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                className="block w-full text-left"
                onClick={() => {
                  if (pin.message_id) onScrollToMessage(pin.message_id);
                  onOpenChange(false);
                }}
              >
                <PinCard
                  pin={pin}
                  message={pin.message_id ? messageById.get(pin.message_id) : undefined}
                />
              </button>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
