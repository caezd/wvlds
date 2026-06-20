// Progression de gamification : 100 XP par niveau.
// Source unique partagée par XPProgress et l'éditeur de persona.

export type LevelInfo = {
  level: number;
  /** XP cumulée nécessaire pour atteindre le niveau suivant. */
  xpForNext: number;
  /** Base d'XP du niveau courant. */
  base: number;
  /** Progression dans le niveau courant, en % (0–100). */
  progress: number;
};

export function levelInfo(xp: number): LevelInfo {
  const level = Math.floor(xp / 100) + 1;
  const base = (level - 1) * 100;
  const progress = Math.min(100, Math.round(((xp - base) / 100) * 100));
  return { level, xpForNext: level * 100, base, progress };
}
