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
    const bio = (String(formData.get("bio") || "").trim() || null) as string | null;
    const avatar_url = (String(formData.get("avatar_url") || "").trim() || null) as string | null;
    const world_id = (String(formData.get("world_id") || "").trim() || null) as string | null;

    if (name.length < 1 || name.length > 40) {
        return {
            ok: false,
            error: "Le nom doit contenir entre 1 et 40 caractères.",
        };
    }

    const { data, error } = await supabase
        .from("personas")
        .insert({ user_id: user.id, name, bio, avatar_url, world_id })
        .select("id")
        .single();

    if (error) {
        const msg =
            error.code === "P0001"
                ? "Limite atteinte : 5 personas par monde (compte gratuit)."
                : error.message;
        return { ok: false, error: msg };
    }

    revalidatePath("/p");
    if (world_id) revalidatePath(`/w/${world_id}`);
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

    const { data: persona } = await supabase
        .from("personas")
        .select("avatar_url, banner_url, world_id")
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
    storagePaths.push(`avatars/${id}.png`, `avatars/${id}.webp`);

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

        const imagePaths = (imageFields ?? []).flatMap((f: { data?: { images?: { id: string }[] } | null }) =>
            (f.data?.images ?? []).map((img) => img.id),
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

    revalidatePath("/p");
    if (persona?.world_id) revalidatePath(`/w/${persona.world_id}`);
    return { ok: true };
}
