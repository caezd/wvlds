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
      "id, name, title, banner_url, icon_url, world_id, created_by, worlds(id, name)",
    )
    .eq("id", id)
    .single();

  if (chatErr || !chatroom) return notFound();

  // 2) 50 derniers messages (ordre croissant pour affichage direct)
  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select(
      "id, chat_id, content, author_id, created_at, persona:personas(id, user_id, name, avatar_url)",
    )
    .eq("chat_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initialMessages = (messages ?? []).slice().reverse(); // on remet en croissant

  /* reactions */
  type ReactionSummary = { emoji: string; count: number; me: boolean };

  const messageIds = initialMessages.map((m) => m.id);
  const byMessage = new Map<
    number,
    Map<string, { count: number; me: boolean }>
  >();

  if (messageIds.length) {
    const { data: rows } = await supabase
      .from("chat_message_reactions")
      .select("message_id, emoji, user_id")
      .eq("chat_id", id)
      .in("message_id", messageIds);

    for (const r of rows ?? []) {
      const mid = Number((r as any).message_id);
      const emoji = String((r as any).emoji);
      const uid = String((r as any).user_id);

      if (!byMessage.has(mid)) byMessage.set(mid, new Map());
      const emMap = byMessage.get(mid)!;

      const prev = emMap.get(emoji) ?? { count: 0, me: false };
      emMap.set(emoji, {
        count: prev.count + 1,
        me: prev.me || (!!user && uid === user.id),
      });
    }
  }

  const initialMessagesWithReactions = initialMessages.map((m) => {
    const emMap = byMessage.get(m.id);
    const reactions: ReactionSummary[] = emMap
      ? Array.from(emMap.entries())
          .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
          .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
      : [];
    return { ...m, reactions };
  });
  /* reactions */

  const userIds = Array.from(
    new Set(
      (initialMessages ?? [])
        .map((m) => (m.author_id ?? m.persona?.user_id) as string | null)
        .filter(Boolean) as string[],
    ),
  );

  let equippedFrames: Record<string, string | null> = {};
  if (userIds.length) {
    const { data: equips } = await supabase
      .from("user_equipped_cosmetics")
      .select("user_id, cosmetic_items:avatar_frame_id(asset_url)")
      .in("user_id", userIds);

    for (const row of equips ?? []) {
      equippedFrames[row.user_id] = row.cosmetic_items?.asset_url ?? null;
    }
  }

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

  // 4) Chatrooms du même world (pour l'aside, rendu instantané)
  const { data: initialRooms, error: navErr } = chatroom.world_id
    ? await supabase.rpc("list_chatrooms_nav", {
        p_world_id: chatroom.world_id,
      })
    : { data: [], error: null };

  // fallback safe
  const initialRoomsSafe = navErr ? [] : (initialRooms ?? []);

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
      initialMessages={initialMessagesWithReactions}
      initialPersona={initialPersona}
      selfId={user?.id ?? null}
      canEdit={canEdit}
      equippedFrames={equippedFrames}
      initialChatrooms={initialRoomsSafe} // ✅ nouveau
    />
  );
}
