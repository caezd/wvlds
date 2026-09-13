// Les catégories repliées du catalogue d'un monde — en localStorage, par
// monde et par onglet, comme l'historique de recherche (lib/searchHistory.ts).
// Un repli est une préférence de lecture, propre à l'appareil : rien à
// synchroniser côté serveur.

function storageKey(worldId: string, type: string): string {
  return `catalogue-collapsed:${worldId}:${type}`;
}

export function loadCollapsedCategories(worldId: string, type: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(worldId, type));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveCollapsedCategories(worldId: string, type: string, ids: Set<string>): void {
  try {
    if (ids.size === 0) localStorage.removeItem(storageKey(worldId, type));
    else localStorage.setItem(storageKey(worldId, type), JSON.stringify([...ids]));
  } catch {
    // ignore (mode privé, quota…)
  }
}
