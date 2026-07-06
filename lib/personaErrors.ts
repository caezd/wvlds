// Traduction des erreurs Postgres liées aux personas en messages utilisateur.
// Partagée entre les actions serveur qui écrivent dans public.personas
// (app/(protected)/p/actions.ts, app/actions/worldCatalog.ts).

import { FREE_PERSONAS_PER_WORLD } from "@/lib/userQuota";

export const QUOTA_ERROR_MESSAGE = `Limite atteinte : ${FREE_PERSONAS_PER_WORLD} personas par monde (compte gratuit).`;
export const DUPLICATE_NAME_MESSAGE =
    "Un persona portant ce nom existe déjà dans le monde cible.";

// P0001 : trigger de quota (enforce_persona_limit).
// 23505 : contraintes uniques (personas_user_id_world_id_name_key,
// personas_world_template_unique).
export function translatePersonaError(error: { code?: string; message: string }) {
    if (error.code === "P0001") return QUOTA_ERROR_MESSAGE;
    if (error.code === "23505") return DUPLICATE_NAME_MESSAGE;
    return error.message;
}
