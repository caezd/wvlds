"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { HelpHint } from "@/components/ui/help-hint";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";
import { getInitials } from "@/lib/textFormatting";
import { cn } from "@/lib/utils";
import { inviteeKey, type ChatroomInvitee } from "@/lib/chatroomAccess";
import { PERSONA_GROUP_COLUMNS, groupChoices, normalizeGroupRow, resolvePersonaGroups, type PersonaGroupRow } from "@/lib/personaGroups";

export type PersonaOption = { id: string; name: string; avatar_url: string | null };
type GroupOption = { id: string; name: string; color: string | null };

/** Normalise pour une recherche sans accents ni casse. */
function plain(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function PersonaThumb({ persona, size }: { persona: PersonaOption; size: number }) {
  return (
    <span aria-hidden className="relative shrink-0 overflow-hidden rounded-md bg-muted" style={{ width: size, height: size }}>
      {persona.avatar_url ? (
        <StoredImage url={persona.avatar_url} width={avatarThumbWidth(size)} alt="" className="object-cover" draggable={false} />
      ) : (
        <span className="grid h-full w-full place-items-center text-2xs font-bold text-muted-foreground">
          {getInitials(persona.name)}
        </span>
      )}
    </span>
  );
}

function InviteeRow({
  name,
  lead,
  on,
  onToggle,
}: {
  name: string;
  lead: React.ReactNode;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          on ? "bg-muted text-foreground" : "hover:bg-muted",
        )}
      >
        {lead}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {on && <Check className="size-4 shrink-0" aria-hidden />}
      </button>
    </li>
  );
}

/**
 * Les invités d'un salon public ou privé : des personas du monde, ou des
 * groupes de personas (tous leurs membres, présents et à venir). Partagé par
 * la création d'un salon et ses réglages.
 */
export function ChatroomInviteesField({
  worldId,
  value,
  onChange,
  label,
  disabled,
}: {
  worldId: string;
  value: ChatroomInvitee[];
  onChange: (next: ChatroomInvitee[]) => void;
  /** L'intitulé, qui dépend de la visibilité (« Qui peut écrire », « Qui peut entrer »). */
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslations("chatrooms.access");
  const supabase = useMemo(() => createClient(), []);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase
        .from("personas")
        .select("id, name, avatar_url")
        .eq("world_id", worldId)
        .is("deleted_at", null)
        .not("is_template", "is", true)
        .order("name"),
      supabase
        .from("world_persona_groups")
        .select(PERSONA_GROUP_COLUMNS)
        .eq("world_id", worldId)
        .order("sort_index"),
    ]).then(([p, g]) => {
      if (cancelled) return;
      setPersonas((p.data ?? []) as PersonaOption[]);
      // En arbre (migration 232) : chaque groupe sous son chemin ; inviter un
      // groupe invite aussi ses sous-groupes.
      setGroups(groupChoices(resolvePersonaGroups(((g.data ?? []) as PersonaGroupRow[]).map(normalizeGroupRow))));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  const selected = useMemo(() => new Set(value.map(inviteeKey)), [value]);
  const q = plain(query.trim());
  const shownGroups = groups.filter((g) => !q || plain(g.name).includes(q));
  const shownPersonas = personas.filter((p) => !q || plain(p.name).includes(q));

  function toggle(invitee: ChatroomInvitee) {
    const key = inviteeKey(invitee);
    onChange(selected.has(key) ? value.filter((i) => inviteeKey(i) !== key) : [...value, invitee]);
  }

  const chips = value.flatMap((i) => {
    if (i.kind === "group") {
      const g = groups.find((x) => x.id === i.id);
      return g ? [{ invitee: i, name: g.name, lead: <BadgeDot color={g.color} /> }] : [];
    }
    const p = personas.find((x) => x.id === i.id);
    return p ? [{ invitee: i, name: p.name, lead: <PersonaThumb persona={p} size={14} /> }] : [];
  });

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 flex w-full items-center justify-between gap-2">
        <SectionLabel as="span">{label}</SectionLabel>
        <HelpHint title={label}>{t("inviteesHelp")}</HelpHint>
      </legend>
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2">
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label={t("selected")}>
            {chips.map(({ invitee, name, lead }) => (
              <li key={inviteeKey(invitee)}>
                <Badge className="gap-1.5 pr-0.5">
                  {lead}
                  <span className="truncate">{name}</span>
                  <button
                    type="button"
                    onClick={() => toggle(invitee)}
                    aria-label={t("remove", { name })}
                    className="grid size-4 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="bg-background pl-9"
          />
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {shownGroups.length > 0 && (
            <div>
              <SectionLabel as="p" className="px-2 py-1">{t("groups")}</SectionLabel>
              <ul>
                {shownGroups.map((g) => (
                  <InviteeRow
                    key={g.id}
                    on={selected.has(`group:${g.id}`)}
                    onToggle={() => toggle({ kind: "group", id: g.id })}
                    name={g.name}
                    lead={
                      <span className="grid size-6 shrink-0 place-items-center">
                        <BadgeDot color={g.color} className="size-2" />
                      </span>
                    }
                  />
                ))}
              </ul>
            </div>
          )}
          {shownPersonas.length > 0 && (
            <div>
              <SectionLabel as="p" className="px-2 py-1">{t("personas")}</SectionLabel>
              <ul>
                {shownPersonas.map((p) => (
                  <InviteeRow
                    key={p.id}
                    on={selected.has(`persona:${p.id}`)}
                    onToggle={() => toggle({ kind: "persona", id: p.id })}
                    name={p.name}
                    lead={<PersonaThumb persona={p} size={24} />}
                  />
                ))}
              </ul>
            </div>
          )}
          {loaded && shownGroups.length === 0 && shownPersonas.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
