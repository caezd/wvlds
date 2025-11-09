"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server"; // <-- ta helper côté serveur
import { revalidatePath } from "next/cache";

const ChatroomSettingsSchema = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(80),
    banner_url: z
        .string()
        .url()
        .optional()
        .or(z.literal(""))
        .transform((v) => v || null),
    icon_url: z
        .string()
        .url()
        .optional()
        .or(z.literal(""))
        .transform((v) => v || null),
});

export async function updateChatroomSettings(input: unknown) {
    const payload = ChatroomSettingsSchema.parse(input);

    const supabase = await createClient();
    const {
        data: { user },
        error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Non authentifié");

    const { data, error } = await supabase
        .from("chatrooms")
        .update({
            title: payload.title,
            banner_url: payload.banner_url,
            icon_url: payload.icon_url,
        })
        .eq("id", payload.id)
        .select("id, title, banner_url, icon_url, updated_at")
        .single();

    if (error) throw new Error(error.message);

    // Revalidate l'écran de la chatroom si tu as une route du genre /chat/[id]
    revalidatePath(`/chat/${payload.id}`);

    return data;
}
