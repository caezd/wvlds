"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPersona(prevState: any, formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Vous devez être connecté." };

    const name = String(formData.get("name") || "").trim();
    const bio = (String(formData.get("bio") || "").trim() || null) as
        | string
        | null;
    const avatar_url = (String(formData.get("avatar_url") || "").trim() ||
        null) as string | null;

    if (name.length < 1 || name.length > 40) {
        return {
            ok: false,
            error: "Le nom doit contenir entre 1 et 40 caractères.",
        };
    }

    const { data, error } = await supabase
        .from("personas")
        .insert({ user_id: user.id, name, bio, avatar_url })
        .select("id")
        .single();

    if (error) {
        const msg =
            error.code === "P0001"
                ? "Limite atteinte : 5 personas pour un compte gratuit."
                : error.message;
        return { ok: false, error: msg };
    }

    revalidatePath("/personas");
    return { ok: true, id: data.id };
}

export async function deletePersona(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from("personas").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/personas");
    return { ok: true };
}
