"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";

/**
 * Canaux de diffusion PRIVÉS partagés entre écrans.
 *
 * La base annonce ses changements par `realtime.send` (migrations 206, 212,
 * 214) sur des canaux privés : `world:<id>`, `wiki:<page>`, `msgs:<user>`…
 * Plusieurs écrans écoutent souvent le même : la liste des salons, la grille,
 * le chat en direct et la carte suivent tous `world:<id>`. Or supabase-js ne
 * tient qu'UN canal par nom (`channel()` rend celui qui existe), et refuse
 * d'y ajouter un `.on()` une fois souscrit. Ouvrir le même nom depuis deux
 * composants faisait lever le second (cf. lib/realtimeChannel).
 *
 * Ici, un seul canal par sujet, ouvert au premier abonné et refermé au
 * dernier. Il écoute TOUS les événements (`event: "*"`) et les redistribue à
 * ses abonnés, qui peuvent donc arriver et partir alors qu'il est déjà souscrit.
 *
 * Remplace les abonnements `postgres_changes` : tant qu'il en reste un seul,
 * Realtime relit le journal de la base en boucle et vérifie chaque changement
 * abonné par abonné.
 */

export type TopicEvent = { event: string; payload: Record<string, unknown> };

export type TopicListener = {
  onEvent: (e: TopicEvent) => void;
  /** Canal (re)joint : premier abonnement, ou retour après une coupure. */
  onSubscribed?: () => void;
};

type Entree = {
  listeners: Set<TopicListener>;
  fermer: () => void;
  souscrit: boolean;
};

const sujets = new Map<string, Entree>();

type Client = Pick<SupabaseClient, "channel" | "removeChannel">;

function ouvrir(topic: string, entree: Omit<Entree, "fermer">, client: Client): () => void {
  return openRealtimeChannel(
    client,
    topic,
    (ch) =>
      ch
        .on("broadcast", { event: "*" }, (msg: { event?: string; payload?: Record<string, unknown> }) => {
          if (!msg.event) return;
          const e = { event: msg.event, payload: msg.payload ?? {} };
          // Copie : un abonné peut se désinscrire pendant la distribution.
          for (const l of [...entree.listeners]) l.onEvent(e);
        })
        .subscribe((status: string) => {
          entree.souscrit = status === "SUBSCRIBED";
          if (!entree.souscrit) return;
          for (const l of [...entree.listeners]) l.onSubscribed?.();
        }),
    { config: { private: true } },
  );
}

/**
 * S'abonne à un sujet ; rend la fonction de désabonnement. Le canal est
 * ouvert au premier abonné, refermé au dernier. `client` : celui de
 * l'appelant quand il en reçoit un (sinon le client du navigateur) — c'est
 * le premier abonné qui ouvre le canal.
 */
export function subscribeTopic(topic: string, listener: TopicListener, client?: Client): () => void {
  let entree = sujets.get(topic);
  if (!entree) {
    const nouvelle = { listeners: new Set<TopicListener>(), souscrit: false } as Entree;
    nouvelle.listeners.add(listener);
    sujets.set(topic, nouvelle);
    nouvelle.fermer = ouvrir(topic, nouvelle, client ?? createClient());
    entree = nouvelle;
  } else {
    entree.listeners.add(listener);
    // Arrivé sur un canal déjà joint : il ne verra pas passer le SUBSCRIBED.
    if (entree.souscrit) listener.onSubscribed?.();
  }

  let actif = true;
  return () => {
    if (!actif) return;
    actif = false;
    const courante = sujets.get(topic);
    if (!courante || !courante.listeners.delete(listener)) return;
    if (courante.listeners.size > 0) return;
    sujets.delete(topic);
    courante.fermer();
  };
}

/**
 * Hook : écoute un sujet tant que le composant est monté (`topic` nul : rien).
 * Les callbacks sont lus dans une ref — les passer en dépendances rouvrirait
 * le canal à chaque rendu. Une reconnexion réseau (`useReconnectEpoch`)
 * referme et rouvre le canal sur une socket neuve, comme les autres canaux.
 *
 * `onResync` : appelé quand le canal est rejoint après une coupure (reconnexion
 * réseau, retour sur un onglet en veille, re-jonction automatique de
 * supabase-js) — jamais à la première jonction. L'écran y relit ses données :
 * les avis émis pendant la coupure ne seront jamais reçus.
 */
export function useTopic(
  topic: string | null | undefined,
  onEvent: (e: TopicEvent) => void,
  options: { onSubscribed?: () => void; onResync?: () => void; client?: Client } = {},
): void {
  const epoch = useReconnectEpoch();
  const ref = useRef({ onEvent, onSubscribed: options.onSubscribed, onResync: options.onResync });
  ref.current = { onEvent, onSubscribed: options.onSubscribed, onResync: options.onResync };
  const client = options.client;
  // Survit aux reconnexions (`epoch`) : une réouverture du canal est une
  // re-jonction, pas un premier chargement. Remis à zéro au changement de
  // sujet, dont les données viennent d'être chargées.
  const joint = useRef<{ topic: string | null | undefined; fois: number }>({ topic, fois: 0 });
  if (joint.current.topic !== topic) joint.current = { topic, fois: 0 };

  useEffect(() => {
    if (!topic) return;
    const etat = joint.current;
    return subscribeTopic(
      topic,
      {
        onEvent: (e) => ref.current.onEvent(e),
        onSubscribed: () => {
          etat.fois += 1;
          if (etat.fois > 1) ref.current.onResync?.();
          ref.current.onSubscribed?.();
        },
      },
      client,
    );
  }, [topic, epoch, client]);
}

/** Noms des sujets (migrations 206, 212, 214). */
export const topic = {
  world: (worldId: string) => `world:${worldId}`,
  wikiPage: (pageId: string) => `wiki:${pageId}`,
  user: (userId: string) => `msgs:${userId}`,
} as const;

/** Vide la table des sujets. Exposé pour les tests. */
export function __resetRealtimeHub(): void {
  sujets.clear();
}

/** Nombre de canaux ouverts. Exposé pour les tests. */
export function __hubTopicCount(): number {
  return sujets.size;
}
