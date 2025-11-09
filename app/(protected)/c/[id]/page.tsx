import ChatRoomView from "./view";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: { id: string } }) {
    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        notFound();
    }

    const { data: chatroom, error: chatErr } = await supabase
        .from("chatrooms")
        .select(
            "id, name, title, banner_url, icon_url, world_id, created_by, worlds(id, name)"
        )
        .eq("id", id)
        .single();

    if (chatErr || !chatroom) return notFound();

    // 2) 50 derniers messages (ordre croissant pour affichage direct)
    const { data: messages, error: msgErr } = await supabase
        .from("chat_messages")
        .select(
            "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url)"
        )
        .eq("chat_id", id)
        .order("created_at", { ascending: false })
        .limit(50);

    const initialMessages = (messages ?? []).slice().reverse(); // on remet en croissant

    // 3) Persona par défaut pour cet utilisateur dans cette chatroom (facultatif)
    let initialPersona: {
        id: string;
        user_id: string;
        name: string;
        avatar_url: string | null;
    } | null = null;
    let canEdit = false;
    if (user) {
        const { data: pref } = await supabase
            .from("chatroom_persona_prefs")
            .select("persona:personas(id, user_id, name, avatar_url)")
            .eq("chat_id", id)
            .eq("user_id", user.id)
            .maybeSingle();
        initialPersona = pref?.persona ?? null;

        canEdit = chatroom.created_by === user.id;
        if (!canEdit && chatroom.world_id) {
            const { data: membership } = await supabase
                .from("world_members")
                .select("role")
                .eq("world_id", chatroom.world_id)
                .eq("user_id", user.id)
                .maybeSingle();

            if (membership && ["owner", "admin"].includes(membership.role)) {
                canEdit = true;
            }
        }
    }

    return (
        <ChatRoomView
            chatId={id}
            initialChat={{
                id: chatroom.id,
                title: chatroom.title ?? "Nouvelle salle",
                banner_url: chatroom.banner_url ?? null,
                icon_url: chatroom.icon_url ?? null,
                worlds: chatroom.worlds ?? null,
            }}
            initialMessages={initialMessages}
            initialPersona={initialPersona}
            selfId={user?.id ?? null}
            canEdit={canEdit}
        />
    );
}
