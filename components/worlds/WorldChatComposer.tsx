"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db-chat";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { Button } from "../ui/button";
import { Plus, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function WorldChatComposer({ worldId }: { worldId: string }) {
    const router = useRouter();
    const [value, setValue] = useState("");
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
        null
    );
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;

        const handler = (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void createChat();
            }
        };

        el.addEventListener("keydown", handler);
        return () => el.removeEventListener("keydown", handler);
    }, [value, selectedPersona]);

    async function createChat() {
        const content = value.trim();
        if (!content) return;

        if (!selectedPersona) {
            // Option simple : bloquer et informer
            toast.error(
                "Veuillez sélectionner une persona avant de continuer."
            );
            return;
        }

        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const title = (() => {
            try {
                return generate().spaced;
            } catch {
                return "Conversation";
            }
        })();

        const { data: room, error: roomErr } = await supabase
            .from("chatrooms")
            .insert({ world_id: worldId, title, created_by: user.id })
            .select("id")
            .single();

        if (roomErr || !room) return;

        // 2) Poster le premier message AVEC persona (obligatoire)
        const { error: msgErr } = await supabase.from("chat_messages").insert({
            chat_id: room.id,
            author_id: user.id,
            content,
            persona_id: selectedPersona.id, // ✅ requis
        });

        if (msgErr) return;

        // 3) Mémoriser la préférence persona pour CETTE chatroom
        await supabase.from("chatroom_persona_prefs").upsert(
            {
                chat_id: room.id,
                user_id: user.id,
                persona_id: selectedPersona.id,
            },
            { onConflict: "chat_id,user_id" }
        );

        setValue("");
        router.push(`/c/${room.id}`);
    }

    return (
        <div className="group/composer w-full">
            <div>
                <div className="cursor-text overflow-clip p-2.5 contain-inline-size bg-hover-400 grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow-short rounded-3xl">
                    <div className="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
                        <div className="_prosemirror-parent_1dsxi_2 text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
                            <textarea
                                ref={textareaRef}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                rows={1}
                                className="outline-0 pb-4 mt-4 white-space-break-spaces -transform-y-[.5px] resize-none"
                                placeholder={"Nouveau jeu..."}
                            ></textarea>
                        </div>
                    </div>
                    <div className="[grid-area:leading]">
                        <span className="flex">
                            <PersonaPickerDialog
                                selected={selectedPersona}
                                onSelect={setSelectedPersona}
                            />
                        </span>
                    </div>
                    <div className="[grid-area:trailing]">
                        <div
                            className={cn(
                                "min-w-9 transition-transform",
                                value.trim()
                                    ? "visible scale-100"
                                    : "invisible scale-80",
                                selectedPersona ? "ml-2" : "ml-0"
                            )}
                        >
                            <Button
                                size={"icon"}
                                className="hover:bg-card-400 bg-white text-background rounded-full"
                            >
                                <SendHorizontal />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
