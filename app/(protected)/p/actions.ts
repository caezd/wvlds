"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QUOTA_ERROR_MESSAGE, translatePersonaError } from "@/lib/personaErrors";
import { ERR_INTROUVABLE, ERR_NOM_PERSONA, ERR_NON_AUTHENTIFIE, echecEnregistrement } from "@/lib/actionErrors";

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
    if (!user) return { ok: false, error: ERR_NON_AUTHENTIFIE };

    const name = String(formData.get("name") || "").trim();
    const bio = (String(formData.get("bio") || "").trim() || null) as string | null;
    const avatar_url = (String(formData.get("avatar_url") || "").trim() || null) as string | null;
    const world_id = (String(formData.get("world_id") || "").trim() || null) as string | null;

    if (name.length < 1 || name.length > 40) {
        return {
            ok: false,
            error: ERR_NOM_PERSONA,
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
        return { ok: false, error: ERR_NON_AUTHENTIFIE };
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

    if (error) return { ok: false, error: echecEnregistrement("deletePersona", error) };
    if (!data) {
        return {
            ok: false,
            error: ERR_INTROUVABLE,
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
    if (!user) return { ok: false, error: ERR_NON_AUTHENTIFIE };

    const { data: persona } = await supabase
        .from("personas")
        .select("id, world_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!persona) {
        return { ok: false, error: ERR_INTROUVABLE };
    }

    const fromWorldId = (persona.world_id as string | null) ?? null;
    if (fromWorldId === targetWorldId) return { ok: true };

    // Pré-check de capacité pour une erreur propre avant l'UPDATE. La vraie
    // garantie (atomique, avec verrou) est le trigger DB qui couvre aussi
    // l'UPDATE de world_id depuis la migration 056 — une erreur RPC ici ne
    // bypasse donc rien, le trigger tranchera.
    const { data: hasCapacity } = await supabase.rpc("has_persona_capacity", {
        u: user.id,
        w: targetWorldId,
    });
    if (hasCapacity === false) {
        return { ok: false, error: QUOTA_ERROR_MESSAGE };
    }

    const { error } = await supabase
        .from("personas")
        .update({ world_id: targetWorldId })
        .eq("id", id)
        .eq("user_id", user.id);
    if (error) {
        return { ok: false, error: translatePersonaError(error) };
    }

    // Si le monde cible impose une fiche par défaut, le joueur a confirmé
    // côté UI (voir PersonasView) que la fiche du persona serait entièrement
    // remplacée par le modèle — pas de fusion, un remplacement complet.
    // Sinon, les verrous hérités d'un monde précédent n'ont plus de raison
    // d'être : le trigger de garde (055) empêche toute modification directe
    // de `locked` sur un persona normal, cette RPC (057) les libère après
    // vérification de propriété côté DB.
    if (targetWorldId) {
        const { data: template } = await supabase
            .from("personas")
            .select("id")
            .eq("world_id", targetWorldId)
            .eq("is_template", true)
            .maybeSingle();
        if (template) {
            await resetPersonaToTemplate(supabase, id, template.id);
        } else {
            await supabase.rpc("release_persona_field_locks", { p_persona_id: id });
        }
    } else {
        await supabase.rpc("release_persona_field_locks", { p_persona_id: id });
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
    if (!user) return { ok: false, error: ERR_NON_AUTHENTIFIE };

    const { data: source } = await supabase
        .from("personas")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!source) {
        return { ok: false, error: ERR_INTROUVABLE };
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
    // id. En cas d'échec, l'asset est abandonné (null) plutôt que de pointer
    // vers le fichier de l'original : deletePersona supprime les fichiers
    // référencés par les URLs, un chemin partagé casserait l'autre persona.
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
        if (error) return null;
        const { data } = supabase.storage.from("personas").getPublicUrl(newPath);
        return data.publicUrl;
    }

    const [avatarUrl, bannerUrl] = await Promise.all([
        copyPersonaAsset(src.avatar_url),
        copyPersonaAsset(src.banner_url),
    ]);
    if (avatarUrl || bannerUrl) {
        // Échec secondaire : le persona dupliqué existe, seuls ses visuels
        // manquent. On ne fait donc pas échouer la duplication — cela
        // laisserait une copie orpheline — mais on cesse de le taire.
        const { error } = await supabase
            .from("personas")
            .update({ avatar_url: avatarUrl, banner_url: bannerUrl })
            .eq("id", newId);
        if (error) console.error("[duplicatePersona] visuels non recopiés", error.message);
    }

    // Si le monde cible impose une fiche par défaut, le joueur a confirmé
    // côté UI que la copie recevrait le modèle plutôt que la structure de
    // l'original — on ne copie alors pas les sections de la source.
    if (targetWorldId) {
        const { data: template } = await supabase
            .from("personas")
            .select("id")
            .eq("world_id", targetWorldId)
            .eq("is_template", true)
            .maybeSingle();
        if (template) {
            await resetPersonaToTemplate(supabase, newId, template.id);
            revalidatePath("/p");
            revalidatePath(`/w/${targetWorldId}`);
            return { ok: true, id: newId };
        }
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
        .select("id, position");

    // Associe ancienne → nouvelle section par la position (unique au sein
    // d'un persona), sans dépendre de l'ordre de retour de l'INSERT — non
    // garanti formellement par Postgres pour un insert multi-lignes.
    const newSectionByPos = new Map<number, string>();
    for (const s of (newSections ?? []) as { id: string; position: number }[]) {
        newSectionByPos.set(s.position, s.id);
    }
    const sectionIdMap = new Map<string, string>();
    for (const s of sectionsList) {
        const nid = newSectionByPos.get(s.position);
        if (nid) sectionIdMap.set(s.id, nid);
    }

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
        .select("id, section_id, position");

    if (!copyImages) return;

    // Même principe que pour les sections : association par clé
    // (section, position) plutôt que par index de retour d'INSERT.
    const newFieldByKey = new Map<string, string>();
    for (const f of (newFields ?? []) as { id: string; section_id: string; position: number }[]) {
        newFieldByKey.set(`${f.section_id}:${f.position}`, f.id);
    }

    for (const oldField of copyableFields) {
        if (oldField.type !== "image-grid") continue;
        const newFieldId = newFieldByKey.get(
            `${sectionIdMap.get(oldField.section_id)}:${oldField.position}`,
        );
        if (!newFieldId) continue;
        const images = (oldField.data?.images ?? []) as GridImage[];
        if (images.length === 0) continue;

        // Copies indépendantes → parallélisées. Une image dont le chemin ne
        // contient pas le persona/champ attendu, ou dont la copie échoue, est
        // abandonnée plutôt que de garder le chemin de l'original : la
        // suppression d'un des deux personas détruirait le fichier de l'autre.
        const copied = (
            await Promise.all(
                images.map(async (img): Promise<GridImage | null> => {
                    const newPath = img.id
                        .replaceAll(fromPersonaId, toPersonaId)
                        .replaceAll(oldField.id, newFieldId);
                    if (newPath === img.id) return null; // chemin inattendu
                    const { error } = await supabase.storage
                        .from("personas")
                        .copy(img.id, newPath);
                    if (error) return null;
                    const { data } = supabase.storage
                        .from("personas")
                        .getPublicUrl(newPath);
                    return { ...img, id: newPath, url: data.publicUrl };
                }),
            )
        ).filter((img): img is GridImage => img !== null);

        // Idem : la section et son champ sont créés, seules les images
        // recopiées n'ont pas été rattachées.
        const { error } = await supabase
            .from("persona_section_fields")
            .update({ data: { ...oldField.data, images: copied } })
            .eq("id", newFieldId);
        if (error) console.error("[copyPersonaSections] images non rattachées", error.message);
    }
}

// Réinitialise entièrement la fiche d'un persona pour qu'elle corresponde à
// la fiche par défaut du monde cible — DESTRUCTIF : tout le contenu existant
// (sections, champs, images) est supprimé avant de recopier le modèle. N'est
// appelée qu'après confirmation explicite du joueur côté UI (voir
// PersonasView, qui prévient que la fiche sera remplacée).
async function resetPersonaToTemplate(
    supabase: Awaited<ReturnType<typeof createClient>>,
    personaId: string,
    templateId: string,
) {
    // Nettoie les fichiers storage des grilles d'images existantes : la RPC
    // ci-dessous ne supprime que les lignes DB, pas les fichiers qu'elles
    // référencent (même logique que deletePersona).
    const { data: sections } = await supabase
        .from("persona_sections")
        .select("id")
        .eq("persona_id", personaId);
    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);
    if (sectionIds.length > 0) {
        const { data: imageFields } = await supabase
            .from("persona_section_fields")
            .select("data")
            .in("section_id", sectionIds)
            .eq("type", "image-grid");
        const imagePaths = (imageFields ?? []).flatMap(
            (f: { data?: { images?: { id: string }[] } | null }) =>
                (f.data?.images ?? []).map((img) => img.id),
        ).filter(Boolean);
        if (imagePaths.length > 0) {
            await supabase.storage.from("personas").remove(imagePaths);
        }
    }

    // Supprime toutes les sections existantes (contourne le trigger de garde
    // des sections/champs verrouillés — légitime ici, le joueur a
    // explicitement confirmé le remplacement complet de sa fiche).
    await supabase.rpc("reset_persona_sections", { p_persona_id: personaId });

    // Recopie la structure fraîche du modèle (identique à la création).
    await copyPersonaSections(supabase, templateId, personaId, {
        copyImages: false,
        keepLocked: true,
    });
}
