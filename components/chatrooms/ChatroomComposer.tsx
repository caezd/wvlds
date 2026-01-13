"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db-chat";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { Button } from "../ui/button";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AutoResizeTextarea } from "../ui/auto-resizable-textarea";

export function ChatroomComposer({
  chatId,
  presetPersona,
  onTyping,
  onPersonaChange,
}: {
  chatId: string;
  presetPersona: Persona | null;
  onTyping?: () => void; // ✅ nouveau
  onPersonaChange?: (p: Persona | null) => void; // ✅ nouveau
}) {
  const supabase = createClient();

  const [value, setValue] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
    presetPersona,
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function send() {
    const text = value.trim();
    if (!text) return;

    if (!selectedPersona) {
      toast.error("Sélectionnez un persona avant d'envoyer.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newMessage, error } = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        author_id: user.id,
        content: text,
        persona_id: selectedPersona.id,
      })
      .select("id, world_id")
      .single();

    if (error) {
      toast.error("Envoi impossible.", { description: error.message });
      return;
    }

    await supabase.from("chatroom_persona_prefs").upsert(
      {
        chat_id: chatId,
        user_id: user.id,
        persona_id: selectedPersona.id,
      },
      { onConflict: "chat_id,user_id" },
    );

    // après avoir inséré le message:
    await supabase.rpc("award_event", {
      p_event: "message_posted",
      p_ref: newMessage.id, // id du chat_message
      p_meta: {
        chat_id: chatId,
        world_id: newMessage.world_id,
        persona_id: selectedPersona.id,
      },
    });

    setValue("");
    // L’UI se mettra à jour via Realtime dans le parent
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Pas d’envoi si l’utilisateur est en composition IME
    if ((e as any).isComposing) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const canSend = value.trim().length > 0 && !!selectedPersona;

  return (
    <div className="group/composer w-full [--thread-content-max-width:40rem] lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width)">
      <div
        className="cursor-text overflow-clip p-2.5 contain-inline-size bg-[#161b27] grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] rounded-[28px] border-border-soft"
        style={{ cornerShape: "superellipse(1.1)" }}
      >
        {/* Zone de saisie */}
        <div className="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
          <div className="_prosemirror-parent_1dsxi_2 text-token-text-primary max-h-52 flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
            <AutoResizeTextarea
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                onTyping?.();
              }}
              onKeyDown={onKeyDown}
              placeholder="Écris ton message en Markdown…"
              className="outline-0 pb-4 mt-4 white-space-break-spaces -transform-y-[.5px] resize-none w-full"
              maxRows={6}
              minRows={1}
            />
            {/* <textarea
                            ref={textareaRef}
                            value={value}
                            onKeyDown={onKeyDown}
                            rows={1}
                            className="outline-0 pb-4 mt-4 white-space-break-spaces -transform-y-[.5px] resize-none w-full"
                            placeholder="Votre message… (Entrée = envoyer, Shift+Entrée = saut de ligne)"
                        /> */}
          </div>
        </div>

        {/* Sélecteur de persona */}
        <div className="[grid-area:leading]">
          <span className="flex">
            <PersonaPickerDialog
              selected={selectedPersona}
              onSelect={(p) => {
                setSelectedPersona(p);
                onPersonaChange?.(p); // ✅ sync présence avec la persona courante
              }}
              required
            />
          </span>
        </div>

        {/* Bouton envoyer */}
        <div className="[grid-area:trailing]">
          <div
            className={cn(
              "min-w-9 transition-transform",
              value.trim() ? "visible scale-100" : "invisible scale-80",
              selectedPersona ? "ml-2" : "ml-0",
            )}
          >
            <Button
              size="icon"
              className="hover:bg-card-400 bg-white text-background rounded-full"
              onClick={() => void send()}
              disabled={!canSend}
              aria-disabled={!canSend}
              title={selectedPersona ? "Envoyer" : "Choisissez un persona"}
            >
              <SendHorizontal />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
