"use client";

import { useEffect, useSyncExternalStore } from "react";
import { subscribeTopic, topic } from "@/lib/realtimeHub";
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
  // Côté serveur, la table du module est commune à toutes les requêtes et à
  // tous les utilisateurs : rien n'y est écrit, le rendu lit `initialRooms`.
  if (typeof window === "undefined") return;
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
 * Corrige un salon déjà listé (titre, nom, icône, catégorie). La liste ne se
 * resème pas sur les rendus serveur — ce serait écraser les mises à jour
 * reçues en direct — : un renommage doit donc y être reporté explicitement,
 * sinon la barre latérale, qui reste montée, garde l'ancien titre.
 */
export function patchWorldRoom(
  worldId: string,
  chatId: string,
  patch: Partial<Pick<WorldRoom, "title" | "name" | "icon_url" | "category_id">>,
): void {
  majRooms(worldId, (prev) => {
    const i = prev.findIndex((r) => r.id === chatId);
    if (i < 0) return prev;
    const avant = prev[i];
    const apres = { ...avant, ...patch };
    if ((Object.keys(patch) as (keyof typeof patch)[]).every((k) => avant[k] === apres[k])) return prev;
    const next = prev.slice();
    next[i] = apres;
    return next;
  });
}

/**
 * Écoute le canal privé du monde (`world:<id>`, migration 214), partagé avec
 * les autres écrans du monde par lib/realtimeHub — une seule souscription,
 * quel que soit le nombre d'instances de la liste.
 *
 * `chatroom` : salon créé, renommé (titre, icône, catégorie) ou supprimé.
 * `summary`  : dernier message d'un salon (tri et avatar du dernier auteur).
 */
function ouvrirCanal(worldId: string): () => void {
  return subscribeTopic(topic.world(worldId), {
    onEvent: ({ event, payload }) => {
      if (event === "chatroom") surSalon(worldId, payload);
      else if (event === "summary") surResume(worldId, payload);
    },
  });
}

type AvisSalon = Partial<Pick<WorldRoom, "id" | "title" | "name" | "icon_url" | "category_id">> & { op?: string };

function surSalon(worldId: string, avis: Record<string, unknown>): void {
  const r = avis as AvisSalon;
  if (!r.id) return;
  const id = r.id;
  if (r.op === "DELETE") {
    majRooms(worldId, (prev) => (prev.some((x) => x.id === id) ? prev.filter((x) => x.id !== id) : prev));
    return;
  }
  const champs = {
    title: r.title ?? null,
    name: r.name ?? null,
    icon_url: r.icon_url ?? null,
    category_id: r.category_id ?? null,
  };
  majRooms(worldId, (prev) => {
    if (prev.some((x) => x.id === id)) return prev; // corrigé ci-dessous
    if (r.op !== "INSERT") return prev;
    return trier([
      ...prev,
      {
        id,
        ...champs,
        last_message_at: null,
        unread_count: 0,
        last_poster_avatar_url: null,
        last_poster_id: null,
        participant_count: 0,
        second_poster_avatar_url: null,
      },
    ]);
  });
  patchWorldRoom(worldId, id, champs);
}

function surResume(worldId: string, avis: Record<string, unknown>): void {
  const s = avis as {
    op?: string;
    chat_id?: string;
    last_message_at?: string | null;
    last_message_author_id?: string | null;
    last_message_persona_avatar_url?: string | null;
  };
  const chatId = s.chat_id;
  if (!chatId) return;
  majRooms(worldId, (prev) => {
    if (!prev.some((r) => r.id === chatId)) return prev;
    const suivant = prev.map((r) =>
      r.id !== chatId
        ? r
        : s.op === "DELETE"
          ? { ...r, last_poster_id: null, last_poster_avatar_url: null, last_message_at: null }
          : {
              ...r,
              last_message_at: s.last_message_at ?? null,
              last_poster_id: s.last_message_author_id ?? null,
              last_poster_avatar_url: s.last_message_persona_avatar_url ?? null,
            },
    );
    return s.op === "DELETE" ? suivant : trier(suivant);
  });
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
    // Rendu serveur et hydratation : les données de la requête, jamais la
    // table du module. Celle du serveur survit d'une requête à l'autre et
    // garderait la liste du premier rendu (salons créés depuis absents,
    // hydratation en échec) ; celle du client peut déjà différer du HTML reçu.
    () => initialRooms,
  );
}
