import { createFenceTracker } from "@/lib/textStyledSpans";

/**
 * Les mentions d'un message : `@pseudo`, `@Nom du rôle`, `@tous`, `@ici`.
 *
 * Elles restent du texte dans le message (pas d'identifiant : le contenu
 * peut être chiffré, seul le client sait ce qu'il envoie), et se résolvent
 * à la lecture contre les rôles du monde. Un nom de rôle peut contenir des
 * espaces : à chaque `@`, on essaie d'abord le plus long nom de rôle qui
 * suit, puis les alias de groupe, puis un pseudo (lettres, chiffres, `_`).
 */

/** `@tous` et `@ici`, dans les trois langues de l'interface. */
export const EVERYONE_ALIASES = ["tous", "everyone", "todos"] as const;
export const HERE_ALIASES = ["ici", "here", "aquí", "aqui"] as const;

export type MentionRole = { id: string; name: string };

export type MentionTargets = {
  usernames: string[];
  roleIds: string[];
  everyone: boolean;
  here: boolean;
};

export type MentionToken =
  | { kind: "user"; username: string; start: number; end: number }
  | { kind: "role"; roleId: string; name: string; start: number; end: number }
  | { kind: "everyone"; start: number; end: number }
  | { kind: "here"; start: number; end: number };

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const USERNAME_RE = /^[A-Za-z0-9_]+/;

const COMBINING_MARKS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/** Sans casse ni accents : « Maître » et « maitre » désignent le même rôle. */
export function foldMention(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS_RE, "").toLowerCase();
}

/** Les mentions d'un texte, dans l'ordre, avec leur position. */
export function tokenizeMentions(text: string, roles: readonly MentionRole[]): MentionToken[] {
  // Plus long d'abord : « Maître du jeu » avant « Maître ».
  const sortedRoles = [...roles].filter((r) => r.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const tokens: MentionToken[] = [];
  // Comparaison tranche par tranche, de la longueur du nom cherché : plier le
  // texte entier décalerait les positions dès qu'un caractère se décompose.
  const startsWithFolded = (rest: string, name: string) =>
    rest.length >= name.length &&
    foldMention(rest.slice(0, name.length)) === foldMention(name) &&
    !WORD_CHAR.test(rest[name.length] ?? " ");

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0 && WORD_CHAR.test(text[i - 1])) continue; // courriel, ou @ collé à un mot
    const rest = text.slice(i + 1);

    let matched: MentionToken | null = null;
    for (const role of sortedRoles) {
      if (startsWithFolded(rest, role.name)) {
        matched = { kind: "role", roleId: role.id, name: rest.slice(0, role.name.length), start: i, end: i + 1 + role.name.length };
        break;
      }
    }
    if (!matched) {
      const alias = (list: readonly string[]) => list.find((a) => startsWithFolded(rest, a));
      const everyone = alias(EVERYONE_ALIASES);
      const here = everyone ? undefined : alias(HERE_ALIASES);
      if (everyone) matched = { kind: "everyone", start: i, end: i + 1 + everyone.length };
      else if (here) matched = { kind: "here", start: i, end: i + 1 + here.length };
    }
    if (!matched) {
      const m = USERNAME_RE.exec(rest);
      if (m) matched = { kind: "user", username: m[0], start: i, end: i + 1 + m[0].length };
    }
    if (matched) {
      tokens.push(matched);
      i = matched.end - 1;
    }
  }
  return tokens;
}

/** Ce qu'il faut notifier : pseudos, rôles (dédoublonnés), tout le monde, les présents. */
export function extractMentionTargets(text: string, roles: readonly MentionRole[]): MentionTargets {
  const targets: MentionTargets = { usernames: [], roleIds: [], everyone: false, here: false };
  for (const tok of tokenizeMentions(text, roles)) {
    if (tok.kind === "user" && !targets.usernames.includes(tok.username)) targets.usernames.push(tok.username);
    else if (tok.kind === "role" && !targets.roleIds.includes(tok.roleId)) targets.roleIds.push(tok.roleId);
    else if (tok.kind === "everyone") targets.everyone = true;
    else if (tok.kind === "here") targets.here = true;
  }
  return targets;
}

// ── Rendu ──────────────────────────────────────────────────────────────────

const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;
const MARKDOWN_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;

function linkSegment(segment: string, roles: readonly MentionRole[]): string {
  const tokens = tokenizeMentions(segment, roles);
  if (tokens.length === 0) return segment;
  let out = "";
  let last = 0;
  for (const tok of tokens) {
    out += segment.slice(last, tok.start);
    const label = segment.slice(tok.start, tok.end);
    const href =
      tok.kind === "role"
        ? `mention:role:${tok.roleId}`
        : tok.kind === "user"
          ? `mention:user:${tok.username}`
          : tok.kind === "everyone"
            ? "mention:all"
            : "mention:here";
    // Un crochet dans un nom de rôle casserait le lien : on l'échappe.
    out += `[${label.replace(/[[\]]/g, "\\$&")}](${href})`;
    last = tok.end;
  }
  return out + segment.slice(last);
}

function linkInlineCodeAware(segment: string, roles: readonly MentionRole[]): string {
  const parts: string[] = [];
  let lastIndex = 0;
  INLINE_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(segment))) {
    parts.push(linkSegment(segment.slice(lastIndex, match.index), roles));
    parts.push(match[0]);
    lastIndex = INLINE_CODE_RE.lastIndex;
  }
  parts.push(linkSegment(segment.slice(lastIndex), roles));
  return parts.join("");
}

function linkLine(line: string, roles: readonly MentionRole[]): string {
  const parts: string[] = [];
  let lastIndex = 0;
  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(line))) {
    parts.push(linkInlineCodeAware(line.slice(lastIndex, match.index), roles));
    parts.push(match[0]);
    lastIndex = MARKDOWN_LINK_RE.lastIndex;
  }
  parts.push(linkInlineCodeAware(line.slice(lastIndex), roles));
  return parts.join("");
}

/**
 * Transforme les mentions en liens `mention:` que le composant `a` de
 * MarkdownRenderer rend en puces. Même discipline que le lexique : les blocs
 * de code, le code inline et les liens existants restent intacts.
 */
export function linkMentions(markdown: string, roles: readonly MentionRole[]): string {
  if (!markdown.includes("@")) return markdown;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const out: string[] = [];
  for (const line of lines) {
    if (fenceTracker.consume(line)) {
      out.push(line);
      continue;
    }
    out.push(linkLine(line, roles));
  }
  return out.join("\n");
}
