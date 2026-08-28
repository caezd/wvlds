"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ouvre un canal Realtime en sérialisant les ouvertures et fermetures d'un
 * même nom.
 *
 * ── Le problème ──────────────────────────────────────────────
 * Dans supabase-js, `channel(topic)` ne crée pas toujours un canal : il rend
 * celui qui porte déjà ce nom (`RealtimeClient.channel`, qui cherche d'abord
 * dans `this.channels`). Et `removeChannel()` est `async` — elle attend
 * `unsubscribe()` avant de démonter le canal.
 *
 * Or React exécute le nettoyage d'un effet puis l'effet suivant dans la même
 * passe, sans rien attendre. Un composant qui referme puis rouvre un canal du
 * même nom — ce que fait chaque reconnexion réseau via `reconnectEpoch` —
 * récupère donc l'ancien canal, encore joint. `.on()` refuse alors :
 *
 *   cannot add `postgres_changes` callbacks for realtime:<nom> after `subscribe()`
 *
 * Jusqu'à supabase-js 2.79 l'appel était ignoré en silence : les handlers
 * étaient simplement perdus, et le composant cessait de recevoir le temps réel
 * sans que rien ne le signale. Depuis 2.112, il lève.
 *
 * ── Pourquoi pas simplement un nom unique ────────────────────
 * Parce que le nom n'est pas toujours un détail local. Pour un canal de
 * `postgres_changes`, il ne sert qu'à router des événements côté client et peut
 * être quelconque. Mais pour la **présence** et le **broadcast**, c'est le point
 * de rendez-vous entre navigateurs : le rendre unique isolerait chaque client
 * dans son propre canal et casserait la fonctionnalité — plus personne ne
 * verrait plus personne.
 *
 * D'où cette approche, qui vaut pour les deux : le nom reste stable, et c'est
 * l'enchaînement qui est corrigé. Une réouverture attend que la fermeture
 * précédente du même nom soit terminée.
 */

/** Fermetures en cours, par nom de canal. */
const fermetures = new Map<string, Promise<unknown>>();

type Client = Pick<SupabaseClient, "channel" | "removeChannel">;
type Canal = ReturnType<SupabaseClient["channel"]>;
type Options = Parameters<SupabaseClient["channel"]>[1];

/**
 * @param supabase client Supabase
 * @param topic    nom du canal — stable, y compris pour présence et broadcast
 * @param build    enchaîne les `.on(...)`, appelle `subscribe()` et rend le canal
 * @param options  options passées à `supabase.channel(topic, options)`
 * @returns la fonction de nettoyage à rendre depuis l'effet
 */
export function openRealtimeChannel(
  supabase: Client,
  topic: string,
  build: (channel: Canal) => Canal,
  options?: Options,
): () => void {
  let annule = false;
  let canal: Canal | null = null;

  const precedente = fermetures.get(topic);

  // Cas courant — aucune fermeture en cours pour ce nom : on ouvre TOUT DE
  // SUITE. Différer systématiquement changerait le comportement observable
  // (le canal n'existerait qu'à la microtâche suivante) sans rien résoudre :
  // le problème ne se pose que lorsqu'une fermeture est en vol.
  const ouverture = precedente
    ? precedente.then(() => {
        // Le composant a pu être démonté pendant l'attente.
        if (annule) return;
        canal = build(supabase.channel(topic, options));
      })
    : ((canal = build(supabase.channel(topic))), Promise.resolve());

  return () => {
    annule = true;

    // Ouverture synchrone : on ferme tout de suite, sans rien différer. C'est
    // le cas courant, et le conserver garde le comportement d'origine —
    // `removeChannel` appelée dans le nettoyage lui-même.
    // Ouverture différée : la fermeture s'enchaîne APRÈS, sinon le canal
    // s'ouvrirait dans le vide sans jamais être refermé.
    const fermeture = canal
      ? Promise.resolve(supabase.removeChannel(canal))
      : ouverture.then(() => (canal ? supabase.removeChannel(canal) : undefined));

    fermetures.set(topic, fermeture);
    // On ne laisse pas la table grossir indéfiniment.
    void fermeture.then(() => {
      if (fermetures.get(topic) === fermeture) fermetures.delete(topic);
    });
  };
}

/** Vide la table des fermetures en attente. Exposé pour les tests. */
export function __resetRealtimeChannels(): void {
  fermetures.clear();
}
