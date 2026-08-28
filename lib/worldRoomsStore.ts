"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";

/**
 * Store externe de la liste des salons d'un monde, partagé par toutes les
 * instances qui l'affichent.
 *
 * Pourquoi : `WorldSidebar` rend `WorldSidebarChatrooms` DEUX fois — une fois
 * dans l'`<aside>` desktop, une fois dans le tiroir mobile. `hidden` en CSS
 * masque mais ne démonte pas : les deux instances vivent en permanence, sur
 * tous les écrans, l'une des deux toujours invisible. Chacune ouvrait son
 * propre canal Realtime, soit deux abonnements pour une seule liste — sur
 * chaque page de monde et de salon.
 *
 * Ce n'était pas visible avant : les deux instances partageaient le même nom
 * de canal, et Supabase renvoyait à la seconde le canal déjà souscrit, dont
 * les handlers étaient ignorés en silence. Le tiroir mobile n'avait donc pas
 * de temps réel du tout. En réparant ce défaut (un `useId()` par instance), la
 * seconde souscription est devenue effective — et son coût aussi.
 *
 * Ici le canal est ouvert par le premier consommateur et fermé par le dernier,
 * par simple comptage de références. Deux instances, une souscription. Le
 * décodage du WAL est de loin le poste dominant côté base : chaque canal en
 * moins compte.
 *
 * Même approche que `lib/presenceStore.ts` : `useSyncExternalStore` suffit,
 * pas de dépendance supplémentaire.
 */

export type WorldRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  category_id: string | null;
  last_poster_avatar_url: string | null;
  last_poster_id: string | null;
  participant_count: number;
  second_poster_avatar_url: string | null;
};

type Entree = {
  rooms: WorldRoom[];
  listeners: Set<() => void>;
  /** Nombre d'instances montées ; le canal vit tant qu'il est superieur a 0. */
  refs: number;
  fermer: (() => void) | null;
};

const mondes = new Map<string, Entree>();
const VIDE: WorldRoom[] = [];

function entree(worldId: string): Entree | undefined {
  return mondes.get(worldId);
}

function notifier(e: Entree): void {
  for (const l of e.listeners) l();
}

/** Trie du plus récent au plus ancien, comme le serveur. */
function trier(rooms: WorldRoom[]): WorldRoom[] {
  return [...rooms].sort(
    (a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
  );
}

/**
 * Fixe la liste d'un monde si elle n'existe pas encore. Appelée pendant le
 * rendu : une entrée neuve n'a aucun abonné, donc aucune notification n'est
 * émise et le rendu d'aucun autre composant n'est déclenché.
 */
function semerSiAbsent(worldId: string, rooms: WorldRoom[]): void {
  if (mondes.has(worldId)) return;
  mondes.set(worldId, { rooms, listeners: new Set(), refs: 0, fermer: null });
}

/** Remplace la liste (retour serveur, changement de monde). */
export function setWorldRooms(worldId: string, rooms: WorldRoom[]): void {
  const e = entree(worldId);
  if (!e) {
    mondes.set(worldId, { rooms, listeners: new Set(), refs: 0, fermer: null });
    return;
  }
  if (e.rooms === rooms) return;
  e.rooms = rooms;
  notifier(e);
}

function majRooms(worldId: string, f: (prev: WorldRoom[]) => WorldRoom[]): void {
  const e = entree(worldId);
  if (!e) return;
  const suivant = f(e.rooms);
  if (suivant === e.rooms) return;
  e.rooms = suivant;
  notifier(e);
}

/**
 * Compteur d'ouvertures, pour donner un nom de canal unique à chaque fois.
 *
 * `removeChannel()` est ASYNCHRONE : le canal reste un instant dans le registre
 * de supabase-js. Un nom stable ferait donc rendre par `channel(topic)` le canal
 * précédent, encore souscrit — et `.on()` lève alors « cannot add
 * postgres_changes callbacks after subscribe() ». Le cas se produit à chaque
 * remontage rapproché, notamment le montage/démontage/remontage que React
 * effectue en mode strict.
 */
let compteurCanal = 0;

/** Ouvre LE canal Realtime du monde — un seul, quel que soit le nombre d'instances. */
function ouvrirCanal(worldId: string): () => void {
  const supabase = createClient();
  compteurCanal += 1;
  const ch = supabase
    .channel(`sidebar-rooms:${worldId}:${compteurCanal}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chatrooms", filter: `world_id=eq.${worldId}` },
      (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as Pick<
          WorldRoom,
          "id" | "title" | "name" | "icon_url" | "last_message_at" | "category_id"
        >;
        majRooms(worldId, (prev) => {
          if (prev.some((x) => x.id === r.id)) return prev;
          return trier([
            ...prev,
            {
              ...r,
              unread_count: 0,
              last_poster_avatar_url: null,
              last_poster_id: null,
              participant_count: 0,
              second_poster_avatar_url: null,
            },
          ]);
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "chatroom_summaries" },
      (payload: { new: Record<string, unknown> }) => {
        const s = payload.new as {
          chat_id: string;
          last_message_at: string | null;
          last_message_author_id: string | null;
          last_message_persona_avatar_url: string | null;
        };
        majRooms(worldId, (prev) => {
          if (!prev.some((r) => r.id === s.chat_id)) return prev;
          return trier(
            prev.map((r) =>
              r.id === s.chat_id
                ? {
                    ...r,
                    last_message_at: s.last_message_at,
                    last_poster_id: s.last_message_author_id,
                    last_poster_avatar_url: s.last_message_persona_avatar_url,
                  }
                : r,
            ),
          );
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "chatroom_summaries" },
      (payload: { old: Record<string, unknown> }) => {
        const chatId = (payload.old as { chat_id?: string }).chat_id;
        if (!chatId) return;
        majRooms(worldId, (prev) => {
          if (!prev.some((r) => r.id === chatId)) return prev;
          return prev.map((r) =>
            r.id === chatId
              ? { ...r, last_poster_id: null, last_poster_avatar_url: null, last_message_at: null }
              : r,
          );
        });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Prend une référence sur le monde ; rend la fonction de relâchement. */
function acquerir(worldId: string, rooms: WorldRoom[]): () => void {
  semerSiAbsent(worldId, rooms);
  const e = entree(worldId)!;
  e.refs += 1;
  if (e.refs === 1) e.fermer = ouvrirCanal(worldId);

  return () => {
    // L'entrée n'est jamais retirée de la table : une fonction de relâchement
    // tardive décrémenterait sinon un objet mort pendant qu'une entrée neuve,
    // recréée entre-temps, garderait un compteur faussé — et rouvrirait un
    // canal alors qu'un autre est déjà souscrit. Le coût mémoire se limite à
    // une liste par monde visité.
    e.refs -= 1;
    if (e.refs > 0) return;
    e.fermer?.();
    e.fermer = null;
  };
}

function abonner(worldId: string, listener: () => void): () => void {
  const e = entree(worldId);
  if (!e) return () => {};
  e.listeners.add(listener);
  return () => {
    e.listeners.delete(listener);
  };
}

/** Remet le store à zéro. Exposé pour les tests. */
export function __resetWorldRoomsStore(): void {
  for (const e of mondes.values()) e.fermer?.();
  mondes.clear();
}

/** Nombre de canaux Realtime ouverts. Exposé pour les tests. */
export function __openChannelCount(): number {
  let n = 0;
  for (const e of mondes.values()) if (e.fermer) n += 1;
  return n;
}

/**
 * Liste des salons du monde, partagée entre toutes les instances montées.
 *
 * `initialRooms` sert de valeur de départ (rendu serveur) et de resemis quand
 * on change de monde — ce composant n'étant pas remonté d'un monde à l'autre.
 */
export function useWorldRooms(worldId: string, initialRooms: WorldRoom[]): WorldRoom[] {
  const reconnectEpoch = useReconnectEpoch();

  // Semis synchrone : sans lui, le premier rendu afficherait une liste vide
  // avant que l'effet ne s'exécute.
  semerSiAbsent(worldId, initialRooms);

  useEffect(() => {
    // Le monde a pu changer sans démontage : on repart des données du serveur.
    setWorldRooms(worldId, initialRooms);
    return acquerir(worldId, initialRooms);
    // `initialRooms` volontairement hors dépendances : sa référence change à
    // chaque rendu et le resemis écraserait les mises à jour Realtime reçues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, reconnectEpoch]);

  return useSyncExternalStore(
    (l) => abonner(worldId, l),
    () => entree(worldId)?.rooms ?? VIDE,
    () => entree(worldId)?.rooms ?? VIDE,
  );
}
