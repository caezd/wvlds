/**
 * Les échanges entre personas (migration 251) : un persona donne à un autre
 * de l'argent, des objets, ou les deux, depuis le composeur. Immédiat ; la
 * base vérifie et trace (`transfer_to_persona`, table `world_transfers`).
 *
 * Fonctions pures, voir `lib/__tests__/worldTrades.test.ts`.
 */

/** Au plus autant de lignes d'inventaire par transfert (borne de la base). */
export const MAX_TRANSFER_ITEMS = 20;

/** Un objet tel qu'il a changé de mains, figé au moment du transfert. */
export type TransferItemSnapshot = {
  catalog_item_id: string | null;
  name: string;
  icon: string | null;
  lucide_icon: string | null;
  image_url: string | null;
  quantity: number;
};

/** Une ligne de `world_transfers`. */
export type WorldTransfer = {
  id: string;
  world_id: string;
  chat_id: string | null;
  from_persona_id: string;
  to_persona_id: string;
  amount: number;
  items: TransferItemSnapshot[];
  created_at: string;
};

/** Ce que le donneur choisit dans son inventaire : la ligne et combien. */
export type TransferItemPick = { id: string; quantity: number };

/** L'option Échanges, et de quoi échanger : la monnaie ou les objets. */
export function worldHasTrades(
  world: { enable_trades?: boolean | null; enable_economy?: boolean | null; enable_inventory?: boolean | null } | null | undefined,
): boolean {
  return !!world && world.enable_trades === true && (world.enable_economy === true || world.enable_inventory !== false);
}

/** Jamais avec soi-même ; avec un persona du même compte si le monde l'autorise. */
export function canTradeWith(
  from: { id: string; user_id: string | null },
  to: { id: string; user_id: string | null },
  sameAccountAllowed: boolean,
): boolean {
  if (from.id === to.id) return false;
  return sameAccountAllowed || from.user_id !== to.user_id;
}

export function transferIsEmpty(amount: number | null, items: readonly TransferItemPick[]): boolean {
  return !(amount && amount > 0) && items.length === 0;
}

/** Le contenu du message : l'identifiant seul, le reste se lit en base. */
export function transferBlockContent(id: string): string {
  return JSON.stringify({ _type: "transfer", id });
}
