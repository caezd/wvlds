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
// entièrement personnalisable. Tous les réglages sont facultatifs : un champ
// absent prend sa valeur par défaut (lib/calloutStyle.ts), si bien qu'un
// encadré écrit avant l'arrivée d'un réglage se lit comme avant.
export type CalloutBorder = "full" | "left" | "separator" | "none";
export type CalloutAlign = "left" | "center" | "right";
export type CalloutIconKind = "emoji" | "lucide" | "image";
export type CalloutSide = "top" | "right" | "bottom" | "left";
export type CalloutBorderWidth = "thin" | "medium" | "thick";
export type CalloutBorderStyle = "solid" | "dashed" | "dotted" | "double";
export type CalloutRadius = "none" | "soft" | "round";
export type CalloutWidth = "full" | "medium" | "narrow";
export type CalloutIconPosition = "inline" | "side" | "top";
export type CalloutIconSize = "small" | "medium" | "large";
export type CalloutFont = "inherit" | "serif" | "mono" | "hand";
export type CalloutImageMode = "background" | "banner";

export type Gauge = { name: string; current: number; max: number; color: string };
export type CalloutField = { key: string; value: string };

export type CalloutBlock = {
  _type: "callout";
  title?: string;            // titre/libellé court optionnel
  text?: string;             // corps optionnel
  icon?: string;             // emoji OU nom d'icône lucide
  iconKind?: CalloutIconKind;
  iconImage?: string;        // URL image quand iconKind === "image"
  accent?: string;           // couleur d'accent (hex), ex. "#f59e0b"
  border?: CalloutBorder;    // défaut "full" ; "separator" = titre entre deux filets
  align?: CalloutAlign;      // défaut "left"
  rounded?: boolean;         // ancien format de l'arrondi : false = aucun
  gauges?: Gauge[];          // jauges nommées (nom, actuel, max, couleur)
  /* Bordure en détail (défauts tirés de `border`) */
  sides?: CalloutSide[];
  borderWidth?: CalloutBorderWidth;
  borderStyle?: CalloutBorderStyle;
  radius?: CalloutRadius;
  /* Couleurs (défaut : l'accent) */
  titleColor?: string;
  borderColor?: string;
  bgColor?: string;
  bgIntensity?: number;      // 0 à 100, en % de la couleur de fond
  image?: string;            // image de fond ou de bandeau
  imageMode?: CalloutImageMode;
  imageVeil?: number;        // 0 à 100 : voile posé sur l'image
  /* Mise en page */
  width?: CalloutWidth;
  iconPosition?: CalloutIconPosition;
  iconSize?: CalloutIconSize;
  /* Typographie */
  font?: CalloutFont;        // police du titre et du texte
  titleFont?: CalloutFont;   // premier nom de `font` (titre seul), lu en repli
  titleSmallCaps?: boolean;
  bodyItalic?: boolean;
  /* Contenu */
  fields?: CalloutField[];   // « clé : valeur » (Lieu, Heure, Météo…)
  collapsible?: boolean;     // corps replié derrière « Afficher la suite »
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
    case "callout": return [
      block.title,
      block.text,
      ...(block.fields ?? []).map((f) => [f.key?.trim(), f.value?.trim()].filter(Boolean).join(" : ")),
      ...(block.gauges ?? []).map((g) => g.name),
    ];
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
