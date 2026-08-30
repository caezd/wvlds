import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLE } from "@/lib/constants";
import { generateRoomKey } from "@/lib/crypto";

/**
 * Clé de chiffrement d'un salon : la récupère, ou la crée si elle manque.
 *
 * ── Le premier client gagne ──────────────────────────────────
 * Un salon fraîchement créé n'a pas encore de clé ; c'est le premier navigateur
 * qui l'ouvre qui en pose une. Si deux personnes y arrivent en même temps, les
 * deux tentent l'insertion — la clé primaire de `chatroom_keys` en refuse une,
 * qui relit alors celle du gagnant.
 *
 * Sans ce rattrapage, la perdante repartirait avec une clé que personne d'autre
 * ne connaît : ses messages seraient illisibles pour tout le monde.
 *
 * Extrait de la vue du salon pour être vérifiable : ce chemin ne se déclenche
 * qu'à la création d'un salon, donc jamais pendant une session ordinaire, et
 * n'avait aucun test.
 *
 * @returns la clé en base64, ou `null` si elle n'a pu être ni lue ni créée
 */
export async function amorcerCleDeSalon(
  supabase: SupabaseClient,
  chatId: string,
): Promise<string | null> {
  const existante = await lireCle(supabase, chatId);
  if (existante) return existante;

  const cle = await generateRoomKey();
  const { error } = await supabase
    .from(TABLE.CHATROOM_KEYS)
    .insert({ chatroom_id: chatId, key_b64: cle });

  // Insertion refusée : quelqu'un est passé avant. On adopte SA clé.
  if (error) return await lireCle(supabase, chatId);

  return cle;
}

async function lireCle(supabase: SupabaseClient, chatId: string): Promise<string | null> {
  const { data } = await supabase
    .from(TABLE.CHATROOM_KEYS)
    .select("key_b64")
    .eq("chatroom_id", chatId)
    .maybeSingle();
  return (data as { key_b64?: string } | null)?.key_b64 ?? null;
}
