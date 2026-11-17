"use client";

import { useCallback, useEffect, useRef } from "react";

type Save<V> = (personaId: string, value: V) => PromiseLike<{ error: { message: string } | null }>;
type Failed<R> = (personaId: string, restore: R, message: string) => void;

type Pending<V, R> = {
  personaId: string;
  /** État d'avant la rafale, rendu à l'écran si l'écriture échoue. */
  restore: R;
  /** Valeur en base avant la rafale : y revenir n'écrit rien. */
  initial: V;
  value: V;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Regroupe les écritures d'un réglage de persona modifié en continu.
 *
 * Le sélecteur de couleur appelle son `onChange` à chaque mouvement du
 * pointeur : écrire en base à chaque appel envoyait une requête par pixel
 * parcouru. Ici l'écran suit chaque mouvement, mais la base ne reçoit que la
 * dernière valeur, `delayMs` après le dernier changement.
 *
 * L'écriture en attente part aussitôt quand on passe à une autre persona, et
 * au démontage (salon quitté, composeur fermé) : rien n'est perdu. En cas
 * d'échec, `onFailed` reçoit l'état d'avant la rafale pour le rétablir.
 */
export function useCoalescedPersonaWrite<V, R>(save: Save<V>, onFailed: Failed<R>, delayMs = 400) {
  const pending = useRef<Pending<V, R> | null>(null);
  const saveRef = useRef(save);
  const onFailedRef = useRef(onFailed);
  saveRef.current = save;
  onFailedRef.current = onFailed;

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    if (Object.is(p.value, p.initial)) return;
    void Promise.resolve(saveRef.current(p.personaId, p.value)).then(({ error }) => {
      if (error) onFailedRef.current(p.personaId, p.restore, error.message);
    });
  }, []);

  const schedule = useCallback(
    (personaId: string, value: V, initial: V, restore: R) => {
      if (pending.current && pending.current.personaId !== personaId) flush();
      const p = pending.current;
      if (p) {
        clearTimeout(p.timer);
        p.value = value;
        p.timer = setTimeout(flush, delayMs);
      } else {
        pending.current = { personaId, restore, initial, value, timer: setTimeout(flush, delayMs) };
      }
    },
    [flush, delayMs],
  );

  useEffect(() => flush, [flush]);

  return schedule;
}
