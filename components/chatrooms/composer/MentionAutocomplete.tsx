"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AtSign, Megaphone, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { foldMention } from "@/lib/mentions";
import { fetchWorldMembers, type WorldMemberRow } from "@/lib/worldMembers";
import { createClient } from "@/lib/supabase/client";
import type { WorldRoleRow } from "@/lib/worldPermissions";
import { getLeadingLetter } from "@/lib/textFormatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type MentionCandidate =
  | { kind: "user"; id: string; label: string; insert: string; avatarUrl: string | null }
  | { kind: "role"; id: string; label: string; insert: string; color: string }
  | { kind: "everyone" | "here"; id: string; label: string; insert: string };

export const MAX_MENTION_CANDIDATES = 8;

/**
 * Les propositions pour une saisie `@query` : membres, rôles qu'on a le droit
 * de pinger, puis `@tous` / `@ici`. Sans casse ni accents ; un préfixe passe
 * avant une occurrence au milieu du nom.
 */
export function buildMentionCandidates(args: {
  query: string;
  members: readonly Pick<WorldMemberRow, "user_id" | "username" | "avatar_url">[];
  roles: readonly WorldRoleRow[];
  canMentionRoles: boolean;
  canMentionEveryone: boolean;
  /** Les mots-clés dans la langue de l'interface : `{ everyone: "tous", here: "ici" }`. */
  tokens: { everyone: string; here: string };
  selfId?: string | null;
}): MentionCandidate[] {
  const q = foldMention(args.query.trim());
  const score = (label: string): number => {
    if (!q) return 1;
    const f = foldMention(label);
    if (f.startsWith(q)) return 2;
    if (f.includes(q)) return 1;
    return 0;
  };
  const scored: { c: MentionCandidate; s: number }[] = [];

  for (const m of args.members) {
    if (!m.username || m.user_id === args.selfId) continue;
    const s = score(m.username);
    if (s) scored.push({ c: { kind: "user", id: m.user_id, label: `@${m.username}`, insert: `@${m.username} `, avatarUrl: m.avatar_url }, s });
  }
  for (const r of args.roles) {
    if (!r.mentionable && !args.canMentionRoles) continue;
    const s = score(r.name);
    if (s) scored.push({ c: { kind: "role", id: r.id, label: `@${r.name}`, insert: `@${r.name} `, color: r.color }, s });
  }
  if (args.canMentionEveryone) {
    const e = score(args.tokens.everyone);
    if (e) scored.push({ c: { kind: "everyone", id: "everyone", label: `@${args.tokens.everyone}`, insert: `@${args.tokens.everyone} ` }, s: e });
    const h = score(args.tokens.here);
    if (h) scored.push({ c: { kind: "here", id: "here", label: `@${args.tokens.here}`, insert: `@${args.tokens.here} ` }, s: h });
  }

  // Les meilleurs d'abord ; à égalité, les membres, puis les rôles, puis
  // @tous et @ici — l'ordre auquel on s'attend en tapant `@`.
  const KIND_ORDER = { user: 0, role: 1, everyone: 2, here: 3 } as const;
  return scored
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind] || a.c.label.localeCompare(b.c.label))
    .slice(0, MAX_MENTION_CANDIDATES)
    .map((x) => x.c);
}

/** Les membres du monde, chargés à la première saisie d'un `@` seulement. */
export function useWorldMentionMembers(worldId: string, ownerId: string, enabled: boolean): WorldMemberRow[] | null {
  const [members, setMembers] = useState<WorldMemberRow[] | null>(null);
  const requestedRef = useRef(false);
  useEffect(() => {
    if (!enabled || !worldId || requestedRef.current) return;
    requestedRef.current = true;
    let cancelled = false;
    const supabase = createClient();
    void fetchWorldMembers(supabase, worldId, ownerId).then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, worldId, ownerId]);
  return members;
}

/**
 * La liste flottante sous le curseur. Le clavier reste dans l'éditeur : c'est
 * le parent qui déplace `activeIndex` et appelle `onPick`.
 */
export function MentionAutocomplete({
  items,
  activeIndex,
  rect,
  onPick,
  onHover,
}: {
  items: MentionCandidate[];
  activeIndex: number;
  rect: DOMRect | null;
  onPick: (item: MentionCandidate) => void;
  onHover: (index: number) => void;
}) {
  const t = useTranslations("chatrooms");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const style = useMemo<React.CSSProperties>(() => {
    if (!rect) return { bottom: 16, left: 16 };
    const width = 288;
    const left = Math.min(Math.max(rect.left, 8), (typeof window !== "undefined" ? window.innerWidth : 1024) - width - 8);
    // Au-dessus du curseur quand la place manque en dessous.
    const spaceBelow = typeof window !== "undefined" ? window.innerHeight - rect.bottom : 400;
    return spaceBelow < 260 ? { bottom: window.innerHeight - rect.top + 6, left } : { top: rect.bottom + 6, left };
  }, [rect]);

  if (items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <ul
      ref={listRef}
      role="listbox"
      aria-label={t("mentions.listLabel")}
      style={style}
      className="fixed z-[60] max-h-64 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md [scrollbar-width:thin]"
    >
      {items.map((item, i) => (
        <li
          key={`${item.kind}:${item.id}`}
          role="option"
          aria-selected={i === activeIndex}
          onMouseEnter={() => onHover(i)}
          // mousedown plutôt que click : un clic ferait perdre la sélection de
          // l'éditeur avant que l'insertion n'ait lieu.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item);
          }}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
            i === activeIndex ? "bg-accent/15 text-foreground" : "text-foreground/90",
          )}
        >
          {item.kind === "user" && (
            <Avatar className="size-5 rounded-full">
              <AvatarImage src={item.avatarUrl ?? undefined} alt="" className="rounded-full" />
              <AvatarFallback className="rounded-full text-[9px]">{getLeadingLetter(item.label.slice(1))}</AvatarFallback>
            </Avatar>
          )}
          {item.kind === "role" && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
          {item.kind === "everyone" && <Megaphone className="size-3.5 shrink-0 text-amber-500" aria-hidden />}
          {item.kind === "here" && <Radio className="size-3.5 shrink-0 text-amber-500" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.kind !== "user" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.kind === "role" ? t("mentions.roleHint") : item.kind === "everyone" ? t("mentions.everyoneHint") : t("mentions.hereHint")}
            </span>
          )}
          {item.kind === "user" && <AtSign className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />}
        </li>
      ))}
    </ul>,
    document.body,
  );
}
