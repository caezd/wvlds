"use client";

import { useCallback, useState, type KeyboardEvent } from "react";

/**
 * État + logique d'une liste de tags libres, saisis un par un (Entrée ou
 * virgule pour confirmer, clic sur un chip pour le retirer). `null` = section
 * désactivée, tableau vide = activée sans tag pour l'instant.
 */
export function useTagChips(initial: string[] | null = null) {
  const [tags, setTags] = useState<string[] | null>(initial);
  const [input, setInput] = useState("");

  const reset = useCallback((next: string[] | null = null) => {
    setTags(next);
    setInput("");
  }, []);

  const toggle = useCallback(() => {
    setTags((prev) => (prev !== null ? null : []));
    setInput("");
  }, []);

  const add = useCallback((raw: string) => {
    const label = raw.trim();
    if (!label) return;
    setTags((prev) => {
      const list = prev ?? [];
      if (list.some((t) => t.toLowerCase() === label.toLowerCase())) return list;
      return [...list, label];
    });
    setInput("");
  }, []);

  const remove = useCallback((label: string) => {
    setTags((prev) => (prev ?? []).filter((t) => t !== label));
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Pas de confirmation pendant la composition IME (CJK…) : laisser
      // l'utilisateur finaliser la saisie avant de traiter Entrée.
      if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        add(input);
      }
    },
    [add, input],
  );

  return { tags, setTags, input, setInput, reset, toggle, add, remove, onKeyDown };
}
