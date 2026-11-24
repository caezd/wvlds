import { useSyncExternalStore } from "react";

/**
 * La place de la chatbox d'un monde dans la page, partagée entre le dock
 * (`WorldLiveChatDock`) et la coquille de l'application (`AppShell`), qui
 * range la page et le dock en conséquence :
 *   - ouverte ou fermée : le dernier choix, retenu par ce navigateur ;
 *   - en bas (sous la page) ou à droite (à côté) : idem ;
 *   - en plein écran : elle prend la place de la page, le temps qu'elle reste
 *     ouverte. Ce mode ne se retient pas : la refermer en sort ;
 *   - sa hauteur (en bas) et sa largeur (à droite), réglées à la poignée
 *     qui la sépare de la page, retenues elles aussi. Nulles : la taille par
 *     défaut (la moitié de l'écran, 24rem).
 *
 * Le rendu serveur la voit fermée, en bas ; le client lit le stockage à
 * l'hydratation (`useSyncExternalStore`).
 */
export type LiveChatPlacement = "bottom" | "side";

export type LiveChatLayout = {
  open: boolean;
  placement: LiveChatPlacement;
  fullscreen: boolean;
  /** En pixels. */
  height: number | null;
  /** En pixels. */
  width: number | null;
};

/** « 1 » : ouverte ; absente, elle est fermée. Vaut pour tous les mondes. */
const OPEN_KEY = "liveChat:open";
/** « side » : à droite ; absente, en bas. */
const PLACEMENT_KEY = "liveChat:placement";
const HEIGHT_KEY = "liveChat:height";
const WIDTH_KEY = "liveChat:width";

const SERVER_LAYOUT: LiveChatLayout = { open: false, placement: "bottom", fullscreen: false, height: null, width: null };

let layout: LiveChatLayout | null = null;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}

function readSize(key: string): number | null {
  const size = Number(read(key));
  return Number.isFinite(size) && size > 0 ? Math.round(size) : null;
}

function getLayout(): LiveChatLayout {
  layout ??= {
    open: read(OPEN_KEY) === "1",
    placement: read(PLACEMENT_KEY) === "side" ? "side" : "bottom",
    fullscreen: false,
    height: readSize(HEIGHT_KEY),
    width: readSize(WIDTH_KEY),
  };
  return layout;
}

function update(patch: Partial<LiveChatLayout>) {
  layout = { ...getLayout(), ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveChatLayout(): LiveChatLayout {
  return useSyncExternalStore(subscribe, getLayout, () => SERVER_LAYOUT);
}

export function setLiveChatOpen(open: boolean) {
  update(open ? { open } : { open, fullscreen: false });
  write(OPEN_KEY, open ? "1" : null);
}

export function setLiveChatPlacement(placement: LiveChatPlacement) {
  update({ placement });
  write(PLACEMENT_KEY, placement === "side" ? "side" : null);
}

export function setLiveChatFullscreen(fullscreen: boolean) {
  update({ fullscreen });
}

/**
 * Change la taille à l'écran ; `persist` l'écrit aussi dans le stockage (à
 * la fin d'un glisser, ou à chaque flèche du clavier).
 */
export function setLiveChatSize(size: { height?: number; width?: number }, persist: boolean) {
  update(size);
  if (!persist) return;
  const { height, width } = getLayout();
  write(HEIGHT_KEY, height ? String(height) : null);
  write(WIDTH_KEY, width ? String(width) : null);
}

/** Un nouveau chargement de page : la mémoire repart du stockage. Pour les tests. */
export function __resetLiveChatLayout() {
  layout = null;
}
