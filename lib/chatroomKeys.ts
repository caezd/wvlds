// Cache en mémoire des clés de chiffrement de salons (chatroom_keys), pour
// le centre de recherche : contrairement à la vue d'une chatroom (qui ne
// connaît que sa propre clé), une recherche peut porter sur plusieurs salons
// d'un monde et a besoin de récupérer/mémoriser plusieurs clés à la fois.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";

const keyCache = new Map<string, string>();
// Plafond (éviction FIFO) — évite une croissance sans borne sur une session
// qui visite beaucoup de salons/mondes différents.
const KEY_CACHE_MAX_SIZE = 500;

/**
 * Clés des salons demandés, en ne consultant la base que pour les inconnues.
 *
 * ── Pourquoi ce cache ne doit JAMAIS tourner côté serveur ────
 * Il est indexé par identifiant de salon, qui n'est pas un secret. Dans un
 * navigateur, il n'y a qu'une personne par processus : chaque entrée a été
 * obtenue par sa propre requête, donc sous sa propre RLS.
 *
 * Sur un serveur Node, le module est partagé par TOUTES les requêtes. Une clé
 * mise en cache pour la personne A serait alors rendue à la personne B sur
 * simple présentation de l'identifiant du salon — sans repasser par la
 * policy `chatroom_keys_select`, qui la réserve aux membres du monde. Le cache
 * court-circuiterait exactement le contrôle qui protège ces clés.
 *
 * D'où la garde ci-dessous. Elle n'est pas théorique : ce module est
 * importable depuis un composant serveur sans que rien ne le signale, et
 * `lib/chatSearch` — son unique appelant — n'a pas de directive `"use client"`
 * (il ne la doit qu'à son consommateur, `SearchCenter`).
 *
 * À comparer avec le cache de `lib/crypto.ts`, indexé par la clé base64
 * elle-même : celui-là est sûr partout, on ne peut en extraire une clé qu'en
 * la fournissant déjà. C'est la différence entre indexer par un secret et
 * indexer par un identifiant public.
 */
export async function getChatroomKeys(
  supabase: SupabaseClient,
  chatIds: string[],
): Promise<Map<string, string>> {
  if (typeof window === "undefined") {
    throw new Error(
      "getChatroomKeys ne doit être appelée que dans le navigateur : son cache " +
        "est indexé par identifiant de salon et serait partagé entre tous les " +
        "utilisateurs d'un processus serveur. Lisez chatroom_keys directement, " +
        "la RLS s'en charge.",
    );
  }

  const missing = chatIds.filter((id) => !keyCache.has(id));
  if (missing.length > 0) {
    const { data } = await supabase
      .from(TABLE.CHATROOM_KEYS)
      .select("chatroom_id, key_b64")
      .in("chatroom_id", missing);
    for (const row of data ?? []) {
      if (keyCache.size >= KEY_CACHE_MAX_SIZE) {
        const oldestKey = keyCache.keys().next().value;
        if (oldestKey !== undefined) keyCache.delete(oldestKey);
      }
      keyCache.set(row.chatroom_id as string, row.key_b64 as string);
    }
  }
  const result = new Map<string, string>();
  for (const id of chatIds) {
    const key = keyCache.get(id);
    if (key) result.set(id, key);
  }
  return result;
}

/** Vide le cache des clés. Exposé pour les tests. */
export function __clearChatroomKeyCache(): void {
  keyCache.clear();
}
