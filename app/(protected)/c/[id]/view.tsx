"use client";

import { createClient } from "@/lib/supabase/client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

import ChatroomSettingsSheet from "@/components/chatrooms/ChatroomSettingsSheet";

export type Persona = {
    id: string;
    user_id: string;
    name: string;
    avatar_url: string | null;
};

export type ChatroomPersonaPref = {
    chat_id: string;
    user_id: string;
    persona_id: string;
    updated_at: string;
};

export type ChatMessageWithPersona = ChatMessage & {
    persona?: Persona | null;
};

type ChatMessage = {
    id: number;
    chat_id: string;
    author_id: string;
    content: string;
    created_at: string;
};

import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { Button } from "@/components/ui/button";
import { Globe, ChevronRight } from "lucide-react";
import Link from "next/link";
import Composer from "@/components/composer";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import { cn } from "@/lib/utils";

function ChatroomHeader({
    chat,
    chatId,
    messagesCount,
    canEdit,
}: {
    chat: any | null; // tolère le chargement
    chatId: string;
    messagesCount: number;
    canEdit: boolean;
}) {
    return (
        <header className="flex draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-background pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)]">
            <div className="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2">
                {/* open button */}
            </div>
            <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center">
                    {chat?.worlds?.id && (
                        <Link
                            href={`/w/${chat?.worlds.id}`}
                            className="hover:bg-hover-400 focus-visible:outline-token-outline-primary text-token-text-secondary ms-2 inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <Globe size={20} className="icon" />
                        </Link>
                    )}
                    <ChevronRight size={16} className="icon-sm text-white/40" />
                    <Button className="hover:bg-hover-400">
                        {chat?.title}
                    </Button>
                </div>
                <div className="flex items-center">
                    {chat && (
                        <ChatroomSettingsSheet
                            canEdit={canEdit}
                            chatroom={{
                                id: chat.id,
                                title: chat.title,
                                banner_url: chat.banner_url ?? null,
                                icon_url: chat.icon_url ?? null,
                                messages_count: messagesCount,
                            }}
                        />
                    )}
                </div>
            </div>
        </header>
    );
}

function isMyMessage(
    m: {
        author_id?: string | null;
        persona?: { user_id?: string | null } | null;
    },
    myId?: string | null
) {
    if (!myId) return false;
    // Priorité au champ author_id du message; sinon on retombe sur l'user_id du persona
    return (m.author_id ?? m.persona?.user_id ?? null) === myId;
}

export default function ChatRoomView({
    chatId,
    initialChat,
    initialMessages,
    initialPersona,
    selfId,
    canEdit,
}: {
    chatId: string;
    initialChat: {
        id: string;
        title: string;
        banner_url: string | null;
        icon_url: string | null;
        worlds: { id: string; name: string } | null;
    };
    initialMessages: ChatMessageWithPersona[];
    initialPersona: Persona | null;
    selfId: string | null;
    canEdit: boolean;
}) {
    const supabase = createClient();

    const [chat, setChat] = useState(initialChat); // 👈 directement depuis la page
    const [messages, setMessages] = useState(initialMessages); // 👈 idem
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(
        initialPersona
    );
    const [openPersona, setOpenPersona] = useState<Persona | null>(null);

    const [userId, setUserId] = useState<string | null>(selfId);
    const [value, setValue] = useState("");

    const endRef = useRef<HTMLDivElement | null>(null);
    const latestIdRef = useRef<number | null>(
        messages.length ? messages[messages.length - 1].id : null
    );

    console.log(chat);

    // Si l'utilisateur n'était pas présent côté serveur, on le récupère ici
    useEffect(() => {
        if (userId) return;
        supabase.auth
            .getUser()
            .then(({ data }) => setUserId(data.user?.id ?? null));
    }, [supabase, userId]);

    // Scroll à la fin quand messages changent
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    // Realtime après bootstrap SSR
    useEffect(() => {
        const channel = supabase
            .channel(`chat-${chatId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chat_messages",
                    filter: `chat_id=eq.${chatId}`,
                },
                async (payload) => {
                    const id = (payload.new as any).id as number;
                    if (latestIdRef.current && id <= latestIdRef.current)
                        return;

                    // Re-fetch 1 ligne avec join persona (pour garder la structure uniforme)
                    const { data } = await supabase
                        .from("chat_messages")
                        .select(
                            "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url)"
                        )
                        .eq("id", id)
                        .single();

                    if (!data) return;
                    setMessages((prev) =>
                        prev.some((m) => m.id === id)
                            ? prev
                            : [...prev, data as ChatMessageWithPersona]
                    );
                    latestIdRef.current = id;
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [chatId, supabase]);

    // Realtime des mises à jour de la chatroom (title/banner/icon)
    useEffect(() => {
        const channel = supabase
            .channel(`chatroom-updates-${chatId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "chatrooms",
                    filter: `id=eq.${chatId}`,
                },
                (payload) => {
                    const next = payload.new as {
                        title?: string | null;
                        name?: string | null;
                        banner_url?: string | null;
                        icon_url?: string | null;
                    };

                    setChat((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            // ta UI utilise "title" : on le met à jour en priorité
                            title: (next.title ??
                                next.name ??
                                prev.title) as string,
                            banner_url: next.banner_url ?? prev.banner_url,
                            icon_url: next.icon_url ?? prev.icon_url,
                        };
                    });
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [chatId, supabase]);

    const messagesCount = messages.length;
    const displayName = chat?.title ?? "Nouvelle salle";

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

        const { data: inserted, error } = await supabase
            .from("chat_messages")
            .insert({
                chat_id: chatId,
                author_id: user.id,
                content: text,
                persona_id: selectedPersona.id,
            })
            // Récupère immédiatement la ligne insérée + le join persona
            .select("*, persona:personas(id, user_id, name, avatar_url)")
            .single();

        if (error) {
            // (optionnel) afficher un toast d’erreur ici
            return;
        }

        // Écho immédiat dans la liste (au cas où Realtime tarde ou soit filtré)
        if (inserted) {
            setMessages((prev) =>
                prev.some((m) => m.id === inserted.id)
                    ? prev
                    : [...prev, inserted as ChatMessageWithPersona]
            );
        }

        setValue("");

        // Mémoriser/effacer la préférence de persona pour cette chatroom
        await supabase.from("chatroom_persona_prefs").upsert(
            {
                chat_id: chatId,
                user_id: user.id,
                persona_id: selectedPersona.id,
            },
            { onConflict: "chat_id,user_id" }
        );
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
        }
    }

    return (
        <div className="composer-parent flex flex-col focus-visible:outline-0 h-full">
            <ChatroomHeader
                chat={chat}
                chatId={chatId}
                messagesCount={messages.length}
                canEdit={canEdit}
            />
            <section className="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:28px] grow flex overflow-hidden">
                <div className="relative h-full">
                    <div className="flex h-full flex-col overflow-y-auto thread-xl:pt-(--header-height) [scrollbar-gutter:stable_both-edges]">
                        <div className="flex flex-col text-sm thread-xl:pt-header-height pb-25">
                            {messages.map((m) => {
                                const mine = isMyMessage(
                                    m,
                                    userId /* ou selfId si c'est ton state */
                                );
                                console.log(m, mine);
                                return (
                                    <article
                                        key={m.id}
                                        className={cn(
                                            "scroll-mt-(--header-height)",
                                            {
                                                "self-end": mine,
                                            }
                                        )}
                                    >
                                        <div className="text-base my-auto mx-auto pt-12 [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)] px-(--thread-content-margin)">
                                            <div className="[--thread-content-max-width:40rem] thread-lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 group/turn-messages focus-visible:outline-hidden relative flex w-full min-w-0 flex-col">
                                                <div className="flex max-w-full flex-col grow">
                                                    <div className="min-h-8 text-message relative flex w-full flex-col items-end gap-2 text-start break-words whitespace-normal [.text-message+&]:mt-1">
                                                        <div className="flex w-full flex-col gap-1 empty:hidden items-end rtl:items-start">
                                                            <div className="bg-card-400 relative rounded-[18px] px-4 py-1.5 data-[multiline]:py-3 max-w-[var(--user-chat-width,70%)]">
                                                                {m.persona
                                                                    ?.name && (
                                                                    <button
                                                                        onClick={() =>
                                                                            setOpenPersona(
                                                                                m.persona!
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-0.5 hover:bg-muted/80"
                                                                        title="Voir le profil du persona"
                                                                    >
                                                                        <span className="inline-flex items-center">
                                                                            {/* mini avatar */}
                                                                            <span className="mr-1 inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-background">
                                                                                {/* si tu as déjà Avatar partout, tu peux remplacer ce span par <Avatar className="h-4 w-4">... */}
                                                                                {m
                                                                                    .persona
                                                                                    .avatar_url ? (
                                                                                    <img
                                                                                        src={
                                                                                            m
                                                                                                .persona
                                                                                                .avatar_url
                                                                                        }
                                                                                        alt={
                                                                                            m
                                                                                                .persona
                                                                                                .name
                                                                                        }
                                                                                        className="h-4 w-4 object-cover"
                                                                                    />
                                                                                ) : (
                                                                                    <span className="text-[10px] leading-none">
                                                                                        {m.persona.name
                                                                                            .slice(
                                                                                                0,
                                                                                                1
                                                                                            )
                                                                                            .toUpperCase()}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            {
                                                                                m
                                                                                    .persona
                                                                                    .name
                                                                            }
                                                                        </span>
                                                                    </button>
                                                                )}
                                                                {m.content}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <footer className="z-0 flex justify-end">
                                                    <span className="touch:-me-2 touch:-ms-3.5 -ms-2.5 -me-1 flex flex-wrap items-center gap-y-4 p-1 select-none focus-within:transition-none hover:transition-none touch:pointer-events-auto touch:opacity-100 duration-300 group-hover/turn-messages:delay-300 pointer-events-none opacity-0 motion-safe:transition-opacity group-hover/turn-messages:pointer-events-auto group-hover/turn-messages:opacity-100 group-focus-within/turn-messages:pointer-events-auto group-focus-within/turn-messages:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100">
                                                        {new Date(
                                                            m.created_at
                                                        ).toLocaleTimeString()}
                                                    </span>
                                                </footer>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                    {/* 
                    <div className="mt-3 space-y-2">
                        <textarea
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Votre message… (Entrée = envoyer, Shift+Entrée = saut de ligne)"
                            rows={3}
                            className="w-full resize-none rounded-xl border p-3 text-sm focus:outline-none focus:ring"
                        />
                    </div> */}
                </div>
                <div ref={endRef} />
            </section>
            <div className="group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)] md:border-transparent md:pt-0 dark:border-white/20 md:dark:border-transparent print:hidden content-fade single-line">
                <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)] px-(--thread-content-margin)">
                    <div className="[--thread-content-max-width:40rem] thread-lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1">
                        <div className="pointer-events-auto relative z-1 flex h-[var(--composer-container-height,100%)] max-w-full flex-[var(--composer-container-flex,1)] flex-col">
                            <ChatroomComposer
                                chatId={chatId}
                                presetPersona={selectedPersona}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {/* Persona Profile Sheet */}
            <Sheet
                open={!!openPersona}
                onOpenChange={(o) => !o && setOpenPersona(null)}
            >
                <SheetContent side="right" className="w-[380px] sm:w-[420px]">
                    <SheetHeader>
                        <SheetTitle>Profil du persona</SheetTitle>
                        <SheetDescription>
                            Détails et actions rapides
                        </SheetDescription>
                    </SheetHeader>

                    {openPersona && (
                        <div className="mt-4 space-y-6">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage
                                        src={
                                            openPersona.avatar_url ?? undefined
                                        }
                                        alt={openPersona.name}
                                    />
                                    <AvatarFallback>
                                        {openPersona.name
                                            .split(" ")
                                            .map((p) => p[0])
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="text-base font-semibold">
                                        {openPersona.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Propriétaire :{" "}
                                        {openPersona.user_id === selfId
                                            ? "Vous"
                                            : openPersona.user_id}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">
                                        Messages ici
                                    </div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="text-xs text-muted-foreground">
                                        Persona ID
                                    </div>
                                    <div className="truncate text-xs">
                                        {openPersona.id}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                                    onClick={() => {
                                        setSelectedPersona(openPersona);
                                        setOpenPersona(null);
                                    }}
                                >
                                    Utiliser ce persona
                                </button>
                                <button
                                    className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                                    onClick={() => setOpenPersona(null)}
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
