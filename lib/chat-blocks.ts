// Types pour les blocs de contenu structuré dans les messages de chatroom.
// Stockés en JSON dans le champ `content` (chiffré si clé présente).

export type DiceBlock = {
  _type: "dice";
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

export type ChatBlock = DiceBlock | BannerBlock | RevealBlock | NpcBlock | HpBlock | CalloutBlock;

const BLOCK_TYPES = new Set(["dice", "banner", "reveal", "npc", "hp", "callout"]);

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

// Helpers dé
export function rollDice(formula: string): Omit<DiceBlock, "_type" | "label"> {
  // Supporte nDm+k ou nDm-k (insensible à la casse)
  const match = formula.trim().match(/^(\d+)[dD](\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Formule invalide : ${formula}`);
  const count = Math.min(parseInt(match[1], 10), 100);
  const faces = Math.min(parseInt(match[2], 10), 1000);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  const results = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
  const total = results.reduce((a, b) => a + b, 0) + modifier;
  return { formula, results, modifier, total };
}
