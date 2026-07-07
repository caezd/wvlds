"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useNotifications } from "@/components/providers/NotificationsProvider";

// On étend le type pour inclure le "summary" embarqué
type Chatroom = {
    id: string;
    title: string;
    updated_at: string;
    banner_url?: string | null;
    summary?: {
        last_message_at: string | null;
        last_message_excerpt: string | null;
        last_message_author_username: string | null;
        last_message_persona_avatar_url: string | null;
        last_message_persona_name: string | null;
    } | null;
};

export function WorldChatroomsList({
    worldId,
    initialChatrooms,
}: {
    worldId: string;
    initialChatrooms: Chatroom[];
}) {
    const [rooms, setRooms] = useState<Chatroom[]>(initialChatrooms);
    const { roomUnread, setActiveChat } = useNotifications();
    const reconnectEpoch = useReconnectEpoch();

    useEffect(() => {
        const supabase = createClient();

        const load = async () => {
            // 👉 On lit le résumé via l’embed "summary:chatroom_summaries(...)"
            const { data } = await supabase
                .from("chatrooms")
                .select(
                    `
                    id,
                    title,
                    updated_at,
                    banner_url,
                    summary:chatroom_summaries(
                    last_message_at,
                    last_message_excerpt,
                    last_message_author_username,
                    last_message_persona_avatar_url,
                    last_message_persona_name
                    )
                `
                )
                .eq("world_id", worldId)
                .order("updated_at", { ascending: false });

            setRooms((data as unknown as Chatroom[]) ?? []);
        };

        void load();

        // ✅ On reste abonné aux changements sur chatrooms
        // (les triggers mettent à jour updated_at → la liste se recharge)
        const channel = supabase
            .channel(`world-chatrooms-${worldId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "chatrooms",
                    filter: `world_id=eq.${worldId}`,
                },
                () => void load()
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [worldId, reconnectEpoch]);

    if (!rooms.length) {
        return (
            <p className="text-sm text-muted-foreground">
                Aucune chatroom encore. Démarrez-en une ci-dessus.
            </p>
        );
    }

    return (
        <ul className="divide-y border rounded-xl">
            {rooms.map((r) => (
                <li
                    key={r.id}
                    className="p-3 relative overflow-hidden rounded-xl "
                >
                    <Link
                        href={`/c/${r.id}`}
                        className="block"
                        onClick={() => {
                            setActiveChat(r.id);
                        }}
                    >
                        <div className="absolute inset-0">
                            <img
                                src={r.banner_url ?? undefined}
                                alt=""
                                className="opacity-50 object-fit-cover -z-10 mask-l-from-0% to-100% w-full"
                            />
                        </div>
                        {/* Ligne titre + date */}
                        <div className="flex items-center justify-between">
                            <span className="font-medium truncate">
                                {r.title}
                            </span>
                            {(roomUnread[r.id] ?? 0) > 0 && (
                                <span
                                    className="ml-2 inline-flex h-2 w-2 rounded-full bg-primary"
                                    title={`${roomUnread[r.id]} non-lu(s)`}
                                />
                            )}
                            <time
                                className="text-xs text-muted-foreground"
                                dateTime={r.updated_at}
                            >
                                {new Date(r.updated_at).toLocaleString()}
                            </time>
                        </div>

                        {/* Ligne apercu dernier message (auteur + extrait) */}
                        {r.summary?.last_message_at && (
                            <div className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                                {r.summary.last_message_persona_avatar_url ? (
                                    <img
                                        src={
                                            r.summary
                                                .last_message_persona_avatar_url
                                        }
                                        width={20}
                                        height={20}
                                        className="rounded-full"
                                    />
                                ) : (
                                    <div className="h-5 w-5 rounded-full bg-muted" />
                                )}

                                <div className="min-w-0">
                                    {/* Pseudo + Persona */}
                                    {r.summary.last_message_author_username && (
                                        <span className="ml-1 text-xs">
                                            @
                                            {
                                                r.summary
                                                    .last_message_author_username
                                            }
                                        </span>
                                    )}
                                    {r.summary.last_message_persona_name && (
                                        <span className="ml-1">
                                            ·{" "}
                                            {
                                                r.summary
                                                    .last_message_persona_name
                                            }
                                        </span>
                                    )}

                                    {/* Extrait */}
                                    <div className="truncate">
                                        {r.summary.last_message_excerpt}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
