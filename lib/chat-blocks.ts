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

export type BannerBlock = {
  _type: "banner";
  url: string;
  alt?: string;
};

export type SceneBlock = {
  _type: "scene";
  text: string;
  label?: string;       // ex. "Scène", "Narrateur", "Introduction"
};

export type FlashbackBlock = {
  _type: "flashback";
  text: string;
  when?: string;        // ex. "Trois ans plus tôt…"
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

export type AlertBlock = {
  _type: "alert";
  severity: "danger" | "warning" | "success";
  tag: string;          // ex. "Mort d'un personnage"
  text?: string;
};

export type WeatherBlock = {
  _type: "weather";
  icon: string;         // emoji
  label: string;        // ex. "Pluie battante"
  note?: string;        // ex. "−1 aux jets de Perception"
};

export type HpBlock = {
  _type: "hp";
  name: string;
  current: number;
  max: number;
};

export type WhisperBlock = {
  _type: "whisper";
  text: string;
};

export type ChatBlock = DiceBlock | EllipseBlock | BannerBlock | SceneBlock | FlashbackBlock | RevealBlock | NpcBlock | AlertBlock | WeatherBlock | HpBlock | WhisperBlock;

const BLOCK_TYPES = new Set(["dice", "ellipse", "banner", "scene", "flashback", "reveal", "npc", "alert", "weather", "hp", "whisper"]);

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
