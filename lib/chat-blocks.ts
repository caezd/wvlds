// Types pour les blocs de contenu structuré dans les messages de chatroom.
// Stockés en JSON dans le champ `content` (chiffré si clé présente).

export type DiceBlock = {
  _type: "dice";
  /** Le lancer tiré par la base (`dice_rolls`, migration 270) ; absent des anciens lancers. */
  roll_id?: string;
  formula: string;      // ex. "2d6+3"
  results: number[];    // résultats individuels de chaque dé
  modifier: number;     // modificateur fixe
  total: number;        // somme finale
  label?: string;       // étiquette optionnelle (ex. "Attaque")
};

export type BannerBlock = {
  _type: "banner";
  url: string;
  alt?: string;
};

export type RevealBlock = {
  _type: "reveal";
  text: string;
  hint?: string;        // indice affiché avant révélation
};

export type NpcBlock = {
  _type: "npc";
  name: string;
  role?: string;        // ex. "Gardien du donjon"
  emoji?: string;       // emoji ou initiales pour l'avatar
  stats?: string;       // ex. "PV 40 · ATQ 12 · DEF 8"
};

export type HpBlock = {
  _type: "hp";
  name: string;
  current: number;
  max: number;
};

// Bloc « Encadré » universel : fusionne les anciens blocs narratifs
// (scène, flashback, ellipse, météo/ambiance, aparté) en un seul bloc
// entièrement personnalisable (icône, couleur d'accent, bordure, alignement).
export type CalloutBorder = "full" | "left" | "separator" | "none";
export type CalloutAlign = "left" | "center";
export type CalloutIconKind = "emoji" | "lucide" | "image";

export type Gauge = { name: string; current: number; max: number; color: string };

export type CalloutBlock = {
  _type: "callout";
  title?: string;            // titre/libellé court optionnel
  text?: string;             // corps optionnel
  icon?: string;             // emoji OU nom d'icône lucide
  iconKind?: CalloutIconKind;
  iconImage?: string;        // URL image quand iconKind === "image"
  accent?: string;           // couleur d'accent (hex), ex. "#f59e0b"
  border?: CalloutBorder;    // défaut "full"
  align?: CalloutAlign;      // défaut "left"
  rounded?: boolean;         // défaut true
  gauges?: Gauge[];          // jauges nommées (nom, actuel, max, couleur)
};

export type AnchorBlock = {
  _type: "anchor";
  label: string;
};

// Bloc « Choix » : sondage à cartes. Les votes (qui n'appartiennent pas à
// l'auteur du message) vivent dans la table chat_choice_votes, pas dans ce
// JSON — voir ChoiceVoteSummary dans types/db.ts.
export type ChoiceOption = { id: string; label: string };

export type ChoiceBlock = {
  _type: "choice";
  question?: string;
  options: ChoiceOption[];
};

// Bloc « Transfert » (migration 251) : l'identifiant d'une ligne de
// world_transfers. Ce qui a changé de mains se lit en base, jamais ici : le
// message s'écrit librement, la ligne seulement par transfer_to_persona.
export type TransferBlock = {
  _type: "transfer";
  id: string;
};

// Bloc « Ellipse » (migration 275) : le saut de temps se lit dans la ligne
// `chatroom_ellipses` que désigne `chat_messages.ellipse_id`, jamais ici.
export type EllipseBlock = {
  _type: "ellipse";
};

export type ChatBlock = DiceBlock | BannerBlock | RevealBlock | NpcBlock | HpBlock | CalloutBlock | AnchorBlock | ChoiceBlock | TransferBlock | EllipseBlock;

const BLOCK_TYPES = new Set(["dice", "banner", "reveal", "npc", "hp", "callout", "anchor", "choice", "transfer", "ellipse"]);

export function parseChatBlock(content: string): ChatBlock | null {
  if (!content.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content);
    if (BLOCK_TYPES.has(parsed._type)) return parsed as ChatBlock;
    return null;
  } catch {
    return null;
  }
}

/** Ce qui se lit d'un bloc, morceau par morceau (sans ses réglages ni identifiants). */
function chatBlockTextParts(block: ChatBlock): (string | undefined)[] {
  switch (block._type) {
    case "choice": return [block.question, ...(block.options ?? []).map((o) => o.label)];
    case "callout": return [block.title, block.text, ...(block.gauges ?? []).map((g) => g.name)];
    case "dice": return [block.label, block.formula];
    case "npc": return [block.name, block.role, block.stats];
    case "hp": return [block.name];
    case "anchor": return [block.label];
    case "banner": return [block.alt];
    // Le texte caché ne s'affiche qu'une fois révélé : seul l'indice se lit.
    case "reveal": return [block.hint];
    case "transfer":
    case "ellipse": return [];
  }
}

/**
 * Le texte qu'un lecteur voit d'un message : un message ordinaire tel quel,
 * un bloc par ce qui s'y lit (jamais son JSON). Sert à la recherche.
 */
export function readableMessageText(content: string): string {
  const block = parseChatBlock(content);
  if (!block) return content;
  return chatBlockTextParts(block).map((part) => part?.trim()).filter(Boolean).join(" · ");
}
