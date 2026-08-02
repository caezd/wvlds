"use client";

import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PinCard } from "@/components/chatrooms/message/PinBar";
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
  const messageById = new Map(messages.map((m) => [m.id, m]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border-soft px-6 py-4">
          <SheetTitle>{t("pinsTitle")}</SheetTitle>
        </SheetHeader>

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
      </SheetContent>
    </Sheet>
  );
}
