// Traduction des erreurs Postgres liées aux personas en CODES d'erreur.
// Partagée entre les actions serveur qui écrivent dans public.personas
// (app/(protected)/p/actions.ts, app/actions/worldCatalog.ts).
//
// Des codes et non des phrases : ces valeurs traversent une action serveur pour
// être affichées côté client, où seule la langue de la personne est connue.
// Voir `lib/actionErrors.ts`.

import { ERR_ENREGISTREMENT, ERR_QUOTA_PERSONAS, ERR_NOM_PERSONA_PRIS } from "@/lib/actionErrors";

export const QUOTA_ERROR_MESSAGE = ERR_QUOTA_PERSONAS;
export const DUPLICATE_NAME_MESSAGE = ERR_NOM_PERSONA_PRIS;

// P0001 : trigger de quota (enforce_persona_limit).
// 23505 : contraintes uniques (personas_user_id_world_id_name_key,
// personas_world_template_unique).
//
// Le repli ne remonte PLUS `error.message` : un message brut de PostgreSQL
// s'affichait tel quel à l'utilisateur, illisible et révélant le nom des tables.
export function translatePersonaError(error: { code?: string; message: string }) {
    if (error.code === "P0001") return ERR_QUOTA_PERSONAS;
    if (error.code === "23505") return ERR_NOM_PERSONA_PRIS;
    return ERR_ENREGISTREMENT;
}
