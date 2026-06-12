"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db-chat";
import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { Button } from "../ui/button";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function WorldChatComposer({ worldId }: { worldId: string }) {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const { userId } = useCurrentUser();

    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

    const createChat = useCallback(async () => {
        const content = value.trim();
        if (!content || loading) return;

        if (!selectedPersona) {
            toast.error("Veuillez sélectionner une persona avant de continuer.");
            return;
        }

        if (!userId) {
            toast.error("Vous devez être connecté.");
            return;
        }

        setLoading(true);
        try {
            const title = (() => {
                try { return generate({ words: 2 }).spaced; }
                catch { return "Conversation"; }
            })();

            const { data: room, error: roomErr } = await supabase
                .from(TABLE.CHATROOMS)
                .insert({ world_id: worldId, title, created_by: userId })
                .select("id")
                .single();

            if (roomErr || !room) {
                toast.error(roomErr?.message ?? "Impossible de créer la chatroom.");
                return;
            }

            const { error: msgErr } = await supabase.from(TABLE.CHAT_MESSAGES).insert({
                chat_id: room.id,
                author_id: userId,
                content,
                persona_id: selectedPersona.id,
            });

            if (msgErr) {
                toast.error(msgErr.message ?? "Impossible d'envoyer le message.");
                return;
            }

            await supabase.from(TABLE.CHATROOM_PERSONA_PREFS).upsert(
                { chat_id: room.id, user_id: userId, persona_id: selectedPersona.id },
                { onConflict: "chat_id,user_id" }
            );

            setValue("");
            router.push(`/c/${room.id}`);
        } finally {
            setLoading(false);
        }
    }, [value, loading, selectedPersona, userId, worldId, supabase, router]);

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey && !(e as unknown as { isComposing: boolean }).isComposing) {
            e.preventDefault();
            void createChat();
        }
    }

    const canSend = value.trim().length > 0 && !!selectedPersona && !loading;

    return (
        <div className="group/composer w-full">
            <div>
                <div className="cursor-text overflow-clip p-2.5 contain-inline-size bg-card-400 grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow-short rounded-3xl">
                    <div className="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
                        <div className="_prosemirror-parent_1dsxi_2 text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
                            <textarea
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                onKeyDown={onKeyDown}
                                rows={1}
                                disabled={loading}
                                className="outline-0 pb-4 mt-4 white-space-break-spaces -transform-y-[.5px] resize-none w-full"
                                placeholder="Nouveau jeu..."
                            />
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
                                value.trim() ? "visible scale-100" : "invisible scale-80",
                                selectedPersona ? "ml-2" : "ml-0"
                            )}
                        >
                            <Button
                                size="icon"
                                onClick={() => void createChat()}
                                disabled={!canSend}
                                aria-disabled={!canSend}
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
