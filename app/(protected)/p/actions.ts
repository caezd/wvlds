"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const QUOTA_ERROR_MESSAGE =
    "Limite atteinte : 5 personas par monde (compte gratuit).";
const DUPLICATE_NAME_MESSAGE =
    "Un persona portant ce nom existe déjà dans le monde cible.";

// Contrainte unique personas_user_id_world_id_name_key (code 23505).
function translatePersonaError(error: { code?: string; message: string }) {
    if (error.code === "P0001") return QUOTA_ERROR_MESSAGE;
    if (error.code === "23505") return DUPLICATE_NAME_MESSAGE;
    return error.message;
}

function extractStoragePath(url: string | null | undefined) {
    if (!url) return null;
    const match = url.match(/\/object\/public\/personas\/([^?]+)/);
    return match ? match[1] : null;
}

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
        return { ok: false, error: translatePersonaError(error) };
    }

    // Fiche par défaut du monde : si un persona modèle existe, sa structure
    // (sections + champs, grilles d'images vides) est copiée sur le nouveau
    // persona. Best effort : un échec de copie ne bloque pas la création.
    if (world_id) {
        const { data: template } = await supabase
            .from("personas")
            .select("id")
            .eq("world_id", world_id)
            .eq("is_template", true)
            .maybeSingle();
        if (template) {
            await copyPersonaSections(supabase, template.id, data.id, {
                copyImages: false,
                keepLocked: true,
            });
        }
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

export async function movePersona(id: string, targetWorldId: string | null) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Vous devez être connecté." };

    const { data: persona } = await supabase
        .from("personas")
        .select("id, world_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!persona) {
        return { ok: false, error: "Persona introuvable ou accès non autorisé." };
    }

    const fromWorldId = (persona.world_id as string | null) ?? null;
    if (fromWorldId === targetWorldId) return { ok: true };

    // Même règle de capacité que l'INSERT (has_persona_capacity côté DB) :
    // le trigger ne couvre que l'insertion, on vérifie donc explicitement
    // avant de déplacer.
    const { data: hasCapacity } = await supabase.rpc("has_persona_capacity", {
        u: user.id,
        w: targetWorldId,
    });
    if (hasCapacity === false) {
        return { ok: false, error: QUOTA_ERROR_MESSAGE };
    }

    // ── FUTUR : fiche par défaut obligatoire ─────────────────────────────
    // Les mondes peuvent définir une fiche par défaut (persona modèle,
    // personas.is_template — voir createPersona qui la copie à la création).
    // Si elle devient un jour *obligatoire*, il faudra vérifier ici que la
    // fiche du persona déplacé est conforme au modèle du monde cible, et la
    // remettre à zéro sinon. Ébauche :
    //
    // const { data: template } = await supabase
    //     .from("personas")
    //     .select("id")
    //     .eq("world_id", targetWorldId)
    //     .eq("is_template", true)
    //     .maybeSingle();
    // if (template && templateIsRequired) {
    //     if (!(await conformsToTemplate(supabase, id, template.id))) {
    //         // Supprime les sections non conformes et recopie la structure
    //         // vierge du modèle (les valeurs saisies sont perdues — prévoir
    //         // une confirmation explicite côté UI avant d'en arriver là).
    //         // await resetPersonaSections(supabase, id);
    //         // await copyPersonaSections(supabase, template.id, id, { copyImages: false });
    //     }
    // }
    // ─────────────────────────────────────────────────────────────────────

    const { error } = await supabase
        .from("personas")
        .update({ world_id: targetWorldId })
        .eq("id", id)
        .eq("user_id", user.id);
    if (error) {
        return { ok: false, error: translatePersonaError(error) };
    }

    revalidatePath("/p");
    if (fromWorldId) revalidatePath(`/w/${fromWorldId}`);
    if (targetWorldId) revalidatePath(`/w/${targetWorldId}`);
    return { ok: true };
}

type SourcePersonaRow = {
    name: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    avatar_config?: unknown;
    avatar_frame_id?: string | null;
    banner_url?: string | null;
};

type GridImage = { id: string; url: string; caption?: string | null };

export async function duplicatePersona(id: string, targetWorldId: string | null) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Vous devez être connecté." };

    const { data: source } = await supabase
        .from("personas")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!source) {
        return { ok: false, error: "Persona introuvable ou accès non autorisé." };
    }
    const src = source as SourcePersonaRow;

    // L'INSERT passe par le trigger/RLS de quota (has_persona_capacity),
    // pas besoin de vérification préalable. Les URLs d'avatar/bannière sont
    // recopiées plus bas vers des chemins propres au nouveau persona (sinon
    // la suppression de l'original casserait les images de la copie).
    const { data: created, error: insertError } = await supabase
        .from("personas")
        .insert({
            user_id: user.id,
            name: src.name,
            bio: src.bio ?? null,
            avatar_config: src.avatar_config ?? null,
            avatar_frame_id: src.avatar_frame_id ?? null,
            world_id: targetWorldId,
        })
        .select("id")
        .single();
    if (insertError || !created) {
        const msg = insertError
            ? translatePersonaError(insertError)
            : "Erreur lors de la duplication.";
        return { ok: false, error: msg };
    }
    const newId = created.id as string;

    // Copie un fichier du bucket "personas" vers un chemin dérivé du nouvel
    // id. Best effort : en cas d'échec on réutilise l'URL d'origine.
    async function copyPersonaAsset(url: string | null | undefined) {
        if (!url) return null;
        const path = extractStoragePath(url);
        if (!path) return url; // URL externe : réutilisée telle quelle
        let newPath = path.replaceAll(id, newId);
        if (newPath === path) {
            newPath = `user-${user!.id}/copies/${newId}-${path.split("/").pop()}`;
        }
        const { error } = await supabase.storage
            .from("personas")
            .copy(path, newPath);
        if (error) return url;
        const { data } = supabase.storage.from("personas").getPublicUrl(newPath);
        return data.publicUrl;
    }

    const [avatarUrl, bannerUrl] = await Promise.all([
        copyPersonaAsset(src.avatar_url),
        copyPersonaAsset(src.banner_url),
    ]);
    if (avatarUrl || bannerUrl) {
        await supabase
            .from("personas")
            .update({ avatar_url: avatarUrl, banner_url: bannerUrl })
            .eq("id", newId);
    }

    await copyPersonaSections(supabase, id, newId, {
        copyImages: true,
        keepLocked: false,
    });

    revalidatePath("/p");
    if (targetWorldId) revalidatePath(`/w/${targetWorldId}`);
    return { ok: true, id: newId };
}

// Copie les sections et leurs champs d'un persona vers un autre.
// `copyImages` : true → les fichiers des grilles d'images sont recopiés vers
// des chemins dérivés du persona cible (duplication — sinon la suppression de
// l'original casserait les images de la copie) ; false → les grilles sont
// copiées vides (application d'une fiche modèle : les images du modèle
// restent la propriété de son auteur, seule la structure est reprise).
// `keepLocked` : true seulement pour l'application d'une fiche modèle — les
// verrous n'ont de sens que vis-à-vis du modèle du monde, une duplication
// produit des champs libres.
async function copyPersonaSections(
    supabase: Awaited<ReturnType<typeof createClient>>,
    fromPersonaId: string,
    toPersonaId: string,
    { copyImages, keepLocked }: { copyImages: boolean; keepLocked: boolean },
) {
    const { data: sections } = await supabase
        .from("persona_sections")
        .select("id, name, position")
        .eq("persona_id", fromPersonaId)
        .order("position", { ascending: true });
    const sectionsList = (sections ?? []) as { id: string; name: string; position: number }[];
    if (sectionsList.length === 0) return;

    const { data: newSections } = await supabase
        .from("persona_sections")
        .insert(
            sectionsList.map((s) => ({
                persona_id: toPersonaId,
                name: s.name,
                position: s.position,
            })),
        )
        .select("id");

    // PostgREST renvoie les lignes insérées dans l'ordre des VALUES.
    const sectionIdMap = new Map<string, string>();
    sectionsList.forEach((s, i) => {
        const nid = (newSections ?? [])[i]?.id;
        if (nid) sectionIdMap.set(s.id, nid);
    });

    const { data: fields } = await supabase
        .from("persona_section_fields")
        .select("id, section_id, type, label, position, data, locked")
        .in("section_id", sectionsList.map((s) => s.id))
        .order("position", { ascending: true });
    const fieldsList = (fields ?? []) as {
        id: string;
        section_id: string;
        type: string;
        label: string | null;
        position: number;
        data: Record<string, unknown>;
        locked?: boolean;
    }[];
    const copyableFields = fieldsList.filter((f) => sectionIdMap.has(f.section_id));
    if (copyableFields.length === 0) return;

    const { data: newFields } = await supabase
        .from("persona_section_fields")
        .insert(
            copyableFields.map((f) => ({
                section_id: sectionIdMap.get(f.section_id),
                type: f.type,
                label: f.label,
                position: f.position,
                locked: keepLocked && (f.locked ?? false),
                data:
                    !copyImages && f.type === "image-grid"
                        ? { ...f.data, images: [] }
                        : f.data,
            })),
        )
        .select("id");

    if (!copyImages) return;

    for (let i = 0; i < copyableFields.length; i++) {
        const oldField = copyableFields[i];
        const newFieldId = (newFields ?? [])[i]?.id as string | undefined;
        if (!newFieldId || oldField.type !== "image-grid") continue;
        const images = (oldField.data?.images ?? []) as GridImage[];
        if (images.length === 0) continue;

        const copied: GridImage[] = [];
        for (const img of images) {
            const newPath = img.id
                .replaceAll(fromPersonaId, toPersonaId)
                .replaceAll(oldField.id, newFieldId);
            const { error } = await supabase.storage
                .from("personas")
                .copy(img.id, newPath);
            if (error) {
                copied.push(img); // best effort : on garde l'original
                continue;
            }
            const { data } = supabase.storage
                .from("personas")
                .getPublicUrl(newPath);
            copied.push({ ...img, id: newPath, url: data.publicUrl });
        }
        await supabase
            .from("persona_section_fields")
            .update({ data: { ...oldField.data, images: copied } })
            .eq("id", newFieldId);
    }
}
