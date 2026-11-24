"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Search, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PersonaThumb } from "@/components/chatrooms/access/ChatroomInviteesField";
import { normalizeForSearch } from "@/lib/chatSearchDirectory";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import {
  groupPathLabel,
  type PersonaGroupAssignment,
  type PersonaGroupIndex,
  type PersonaGroupRow,
  type ResolvedPersonaGroup,
} from "@/lib/personaGroups";
import {
  addPersonasToGroup,
  fetchGroupAssignments,
  removePersonaFromGroup,
  setPrimaryGroup,
} from "@/lib/personaGroupMembership";
import { FIELD, FeaturePage, SETTINGS_ROW, SettingsSection } from "./FeatureLayout";

/** Un persona du monde, tel que la fiche d'un groupe le montre. */
export type GroupPersona = {
  id: string;
  name: string;
  avatar_url: string | null;
  user_id: string;
  is_npc: boolean;
  /** Le pseudo de son joueur. */
  username: string | null;
};

/** Une ligne de choix, comme celles des invités d'un salon. */
const PICK_ROW =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * La fiche d'un groupe de personas (onglet Groupes des réglages) : sa
 * description, ses membres, l'ajout de plusieurs personas d'un coup. Un
 * persona peut appartenir à plusieurs groupes (migration 242) : chaque membre
 * dit quel groupe lui donne sa couleur, et peut en faire celui-ci.
 *
 * Après chaque écriture d'appartenance, les affectations sont relues : la
 * base tient seule le groupe principal (`lib/personaGroupMembership`).
 */
export function WorldGroupDetail({
  worldId,
  group,
  groupsById,
  personas,
  index,
  onBack,
  onEdit,
  onSave,
  onAssignmentsChange,
}: {
  worldId: string;
  group: ResolvedPersonaGroup;
  groupsById: ReadonlyMap<string, ResolvedPersonaGroup>;
  /** Les personas du monde, par nom. */
  personas: readonly GroupPersona[];
  index: PersonaGroupIndex;
  onBack: () => void;
  /** Modifie la ligne à l'écran, sans l'enregistrer. */
  onEdit: (patch: Partial<PersonaGroupRow>) => void;
  onSave: (patch: Pick<PersonaGroupRow, "description">) => Promise<boolean>;
  onAssignmentsChange: (rows: PersonaGroupAssignment[]) => void;
}) {
  const t = useTranslations("relations");
  const tNpc = useTranslations("personas.npc");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);

  // ── Description : enregistrée en quittant le champ, si elle a changé ──
  const atFocus = React.useRef(group.description ?? "");
  async function saveDescription(raw: string) {
    const value = raw.trim() || null;
    onEdit({ description: value });
    if ((value ?? "") === atFocus.current.trim()) return;
    if (!(await onSave({ description: value }))) onEdit({ description: atFocus.current || null });
  }

  // ── Membres ──
  const members = personas.filter((p) => index.groupsByPersona.get(p.id)?.includes(group.id));
  const candidates = personas.filter((p) => !index.groupsByPersona.get(p.id)?.includes(group.id));
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const q = normalizeForSearch(query);
  const shown = candidates.filter(
    (p) => !q || normalizeForSearch(p.name).includes(q) || normalizeForSearch(p.username ?? "").includes(q),
  );

  async function write(run: () => Promise<boolean>) {
    setBusy(true);
    try {
      if (!(await run())) { toast.error(tCommon("saveError")); return false; }
      const rows = await fetchGroupAssignments(supabase, worldId);
      if (rows) onAssignmentsChange(rows);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addPicked() {
    if (await write(() => addPersonasToGroup(supabase, worldId, group.id, picked))) {
      setPicked([]);
      setQuery("");
    }
  }

  const playerLine = (p: GroupPersona) => (p.is_npc ? tNpc("badge") : p.username ? `@${p.username}` : null);

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t("groups")}
      </Button>
      <FeaturePage title={groupPathLabel(group)}>
        <SettingsSection title={t("groupInfo")}>
          <Textarea
            value={group.description ?? ""}
            aria-label={t("groupDescription")}
            placeholder={t("groupDescriptionPlaceholder")}
            maxLength={DB_TEXT_LIMITS["world_persona_groups.description"]}
            rows={3}
            className={cn(FIELD, "resize-y")}
            onFocus={(e) => { atFocus.current = e.target.value; }}
            onChange={(e) => onEdit({ description: e.target.value })}
            onBlur={(e) => void saveDescription(e.target.value)}
          />
        </SettingsSection>

        <SettingsSection
          title={t("groupMembers")}
          help={t("groupMembersHelp")}
          meta={t("memberCount", { count: members.length })}
        >
          {members.length === 0 && <p className="text-xs italic text-muted-foreground">{t("noMembers")}</p>}
          <ul className="space-y-2" aria-label={t("groupMembers")}>
            {members.map((p) => {
              const primaryId = index.primaryByPersona.get(p.id);
              const primary = primaryId === group.id;
              const elsewhere = primaryId && !primary ? groupsById.get(primaryId) : undefined;
              const line = playerLine(p);
              return (
                <li key={p.id} className={SETTINGS_ROW}>
                  <PersonaThumb persona={p} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" data-member-name>{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[line, elsewhere ? t("primaryElsewhere", { name: groupPathLabel(elsewhere) }) : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {primary && <Badge>{t("primaryBadge")}</Badge>}
                  {!primary && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8 text-muted-foreground"
                      disabled={busy}
                      aria-label={t("makePrimary", { name: p.name })}
                      title={t("makePrimary", { name: p.name })}
                      onClick={() => void write(() => setPrimaryGroup(supabase, p.id, group.id))}
                    >
                      <Star className="size-4" aria-hidden />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-muted-foreground"
                    disabled={busy}
                    aria-label={t("removeFromGroup", { name: p.name })}
                    title={t("removeFromGroup", { name: p.name })}
                    onClick={() => void write(() => removePersonaFromGroup(supabase, p.id, group.id))}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </SettingsSection>

        <SettingsSection title={t("addPersonas")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPersonaOrPlayer")}
              aria-label={t("searchPersonaOrPlayer")}
              className={cn(FIELD, "pl-9")}
            />
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label={t("addPersonas")}>
            {shown.map((p) => {
              const on = picked.includes(p.id);
              const line = playerLine(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((prev) => (on ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                    className={cn(PICK_ROW, on ? "bg-muted text-foreground" : "hover:bg-muted")}
                  >
                    <PersonaThumb persona={p} size={24} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {line && <span className="shrink-0 truncate text-xs text-muted-foreground">{line}</span>}
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {candidates.length === 0 ? t("allPersonasInGroup") : t("noSearchResults")}
            </p>
          )}
          {picked.length > 0 && (
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={busy} onClick={() => void addPicked()}>
                {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {t("addSelected", { count: picked.length })}
              </Button>
            </div>
          )}
        </SettingsSection>
      </FeaturePage>
    </div>
  );
}
