// Historique local des termes recherchés dans le centre de recherche —
// stocké en localStorage (par monde), pas besoin de backend pour un simple
// rappel des dernières recherches façon Discord.
const MAX_ENTRIES = 8;

function storageKey(worldId: string): string {
  return `search-history:${worldId}`;
}

export function loadSearchHistory(worldId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(worldId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addSearchHistoryEntry(worldId: string, term: string): string[] {
  const trimmed = term.trim();
  const existing = loadSearchHistory(worldId);
  if (!trimmed) return existing;
  const deduped = existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...deduped].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(storageKey(worldId), JSON.stringify(next));
  } catch {
    // ignore (mode privé, quota…)
  }
  return next;
}

export function clearSearchHistory(worldId: string): void {
  try {
    localStorage.removeItem(storageKey(worldId));
  } catch {
    // ignore
  }
}
