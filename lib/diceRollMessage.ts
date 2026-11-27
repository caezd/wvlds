import { RPC } from "@/lib/constants";
import { diceBlockFromRoll, diceRollErrorKey, type DiceRoll, type DiceRollErrorKey, type DiceRollRequest } from "@/lib/worldDice";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Fait tirer un lancer par la base (`roll_dice`, migration 270), puis rend le
 * texte du message qui le publie et l'id du lancer, à poser dans
 * `chat_messages.dice_roll_id`. Un refus de la base rend sa clé de traduction
 * (`chatrooms.diceErrors.*`).
 */
export async function rollDiceForMessage(
  supabase: RpcClient,
  chatId: string,
  request: DiceRollRequest,
): Promise<{ ok: true; text: string; diceRollId: string } | { ok: false; error: DiceRollErrorKey }> {
  const { data, error } = await supabase.rpc(RPC.ROLL_DICE, {
    p_chat: chatId,
    p_die: "dieId" in request ? request.dieId : null,
    p_count: request.count,
    p_modifier: request.modifier,
    p_faces: "faces" in request ? request.faces : null,
  });
  if (error || !data) return { ok: false, error: diceRollErrorKey(error?.message) };
  const roll = data as DiceRoll;
  return { ok: true, diceRollId: roll.id, text: JSON.stringify(diceBlockFromRoll(roll, request.label)) };
}
