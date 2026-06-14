"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPersona(_prevState: unknown, formData: FormData) {
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
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { ok: false, error: "Vous devez être connecté." };
    }

    const storagePaths: string[] = [];

    // Avatar et bannière
    const { data: persona } = await supabase
        .from("personas")
        .select("avatar_url, banner_url")
        .eq("id", id)
        .single();

    function extractStoragePath(url: string | null | undefined) {
        if (!url) return null;
        const match = url.match(/\/object\/public\/personas\/([^?]+)/);
        return match ? match[1] : null;
    }

    const avatarPath = extractStoragePath(persona?.avatar_url);
    const bannerPath = extractStoragePath(persona?.banner_url);
    if (avatarPath) storagePaths.push(avatarPath);
    if (bannerPath) storagePaths.push(bannerPath);
    // Anciens avatars générés (chemin sans préfixe user-)
    storagePaths.push(`avatars/${id}.png`, `avatars/${id}.webp`);

    // Images des champs image-grid
    const { data: sections } = await supabase
        .from("persona_sections")
        .select("id")
        .eq("persona_id", id);

    if (sections?.length) {
        const sectionIds = sections.map((s: { id: string }) => s.id);
        const { data: imageFields } = await supabase
            .from("persona_section_fields")
            .select("data")
            .in("section_id", sectionIds)
            .eq("type", "image-grid");

        const imagePaths = (imageFields ?? []).flatMap((f: any) =>
            (f.data?.images ?? []).map((img: { id: string }) => img.id),
        ).filter(Boolean);
        storagePaths.push(...imagePaths);
    }

    if (storagePaths.length) {
        await supabase.storage.from("personas").remove(storagePaths);
    }

    const { data, error } = await supabase
        .from("personas")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) {
        return {
            ok: false,
            error: "Persona introuvable ou accès non autorisé.",
        };
    }
    revalidatePath("/personas");
    return { ok: true };
}
