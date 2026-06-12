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

export type EllipseBlock = {
  _type: "ellipse";
  label: string;        // ex. "3 jours plus tard…"
};

export type ChatBlock = DiceBlock | EllipseBlock;

export function parseChatBlock(content: string): ChatBlock | null {
  if (!content.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed._type === "dice" || parsed._type === "ellipse") return parsed as ChatBlock;
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
