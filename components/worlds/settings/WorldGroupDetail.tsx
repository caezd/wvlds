"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Pipette, Search, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PersonaThumb } from "@/components/chatrooms/access/ChatroomInviteesField";
import { normalizeForSearch } from "@/lib/chatSearchDirectory";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";
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
import { ColorPickerButton } from "./ColorPickerButton";
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

/** Ce qui se règle sur la page d'un groupe, avant ses membres. */
export type GroupFields = Pick<PersonaGroupRow, "name" | "description" | "color" | "apply_color">;

/** Un libellé de champ, discret, au-dessus du champ. */
const FIELD_LABEL = "text-xs font-normal text-muted-foreground";

/**
 * La page d'un groupe de personas (onglet Groupes des réglages). On y crée
 * un groupe (`group` nul, sous `parent` s'il en a un) puis on le règle : nom,
 * description, couleur — propre ou héritée du parent —, couleur appliquée ou
 * non. La liste des groupes ne fait qu'ouvrir cette page, déplacer et
 * supprimer.
 *
 * Un groupe existant s'enregistre champ par champ : le nom et la description
 * en quittant le champ, la couleur un instant après le dernier réglage,
 * l'interrupteur à la bascule. Ses membres viennent ensuite (`GroupMembers`).
 */
export function WorldGroupDetail({
  worldId,
  group,
  parent,
  groupsById,
  personas,
  index,
  onBack,
  onEdit,
  onSave,
  onColorChange,
  onCreate,
  onAssignmentsChange,
}: {
  worldId: string;
  /** Nul : la page crée un groupe. */
  group: ResolvedPersonaGroup | null;
  /** Le groupe parent, pour un sous-groupe. */
  parent: ResolvedPersonaGroup | undefined;
  groupsById: ReadonlyMap<string, ResolvedPersonaGroup>;
  /** Les personas du monde, par nom. */
  personas: readonly GroupPersona[];
  index: PersonaGroupIndex;
  onBack: () => void;
  /** Modifie la ligne à l'écran, sans l'enregistrer. */
  onEdit: (patch: Partial<GroupFields>) => void;
  onSave: (patch: Partial<GroupFields>) => Promise<boolean>;
  /** Montre la couleur et l'enregistre un instant après le dernier réglage. */
  onColorChange: (color: string) => void;
  onCreate: (values: GroupFields) => Promise<boolean>;
  onAssignmentsChange: (rows: PersonaGroupAssignment[]) => void;
}) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const nameId = React.useId();
  const descriptionId = React.useId();

  // ── Création : un brouillon, enregistré d'un coup ──
  const creating = group === null;
  const [draft, setDraft] = React.useState<GroupFields>(() => ({
    name: "",
    description: null,
    // Un sous-groupe prend d'abord la couleur de son parent, et l'applique comme lui.
    color: parent ? null : DEFAULT_PLAYER_COLOR,
    apply_color: parent?.apply_color ?? true,
  }));
  const [submitting, setSubmitting] = React.useState(false);
  const values: GroupFields = group ?? draft;

  function change(patch: Partial<GroupFields>) {
    if (creating) setDraft((prev) => ({ ...prev, ...patch }));
    else onEdit(patch);
  }

  /** Enregistre un champ d'un groupe existant ; un échec rend la valeur d'avant. */
  async function commit(patch: Partial<GroupFields>, before: Partial<GroupFields>) {
    onEdit(patch);
    if (!(await onSave(patch))) onEdit(before);
  }

  async function create() {
    const name = draft.name.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    const ok = await onCreate({ ...draft, name, description: draft.description?.trim() || null });
    if (!ok) setSubmitting(false);
  }

  // ── Nom et description : enregistrés en quittant le champ, s'ils ont changé ──
  const atFocus = React.useRef({ name: values.name, description: values.description ?? "" });
  async function saveName(raw: string) {
    if (creating) return;
    const name = raw.trim();
    const before = atFocus.current.name;
    // Un groupe garde un nom : vidé, le champ reprend l'ancien.
    if (!name) { onEdit({ name: before }); return; }
    if (name === before) { onEdit({ name }); return; }
    await commit({ name }, { name: before });
  }
  async function saveDescription(raw: string) {
    if (creating) return;
    const description = raw.trim() || null;
    const before = atFocus.current.description.trim() || null;
    if (description === before) { onEdit({ description }); return; }
    await commit({ description }, { description: before });
  }

  // ── Couleur : propre, ou celle du parent ──
  const inherited = values.color === null && !!parent;
  const swatch = values.color ?? parent?.swatch ?? DEFAULT_PLAYER_COLOR;

  const title = group
    ? groupPathLabel(group)
    : parent ? t("newSubgroupOf", { name: groupPathLabel(parent) }) : t("newGroup");

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t("groups")}
      </Button>
      <FeaturePage title={title}>
        <SettingsSection title={t("groupInfo")}>
          <div className="space-y-1.5">
            <Label htmlFor={nameId} className={FIELD_LABEL}>{t("groupName")}</Label>
            <Input
              id={nameId}
              value={values.name}
              placeholder={t("groupNamePlaceholder")}
              maxLength={DB_TEXT_LIMITS["world_persona_groups.name"]}
              autoFocus={creating}
              className={FIELD}
              onFocus={(e) => { atFocus.current.name = e.target.value; }}
              onChange={(e) => change({ name: e.target.value })}
              onBlur={(e) => void saveName(e.target.value)}
              onKeyDown={(e) => { if (creating && e.key === "Enter") void create(); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={descriptionId} className={FIELD_LABEL}>{t("groupDescription")}</Label>
            <Textarea
              id={descriptionId}
              value={values.description ?? ""}
              placeholder={t("groupDescriptionPlaceholder")}
              maxLength={DB_TEXT_LIMITS["world_persona_groups.description"]}
              rows={3}
              className={cn(FIELD, "resize-y")}
              onFocus={(e) => { atFocus.current.description = e.target.value; }}
              onChange={(e) => change({ description: e.target.value })}
              onBlur={(e) => void saveDescription(e.target.value)}
            />
          </div>
        </SettingsSection>

        <SettingsSection title={t("groupColor")}>
          <div className={cn(SETTINGS_ROW, "pr-3")} data-group-color>
            <div
              className={cn("flex rounded-md", inherited && "outline-1 outline-offset-2 outline-dashed outline-muted-foreground/60")}
              data-inherited={inherited || undefined}
            >
              <ColorPickerButton
                color={swatch}
                className="size-7 rounded-md border-0 shadow-none"
                onChange={(color) => (creating ? change({ color }) : onColorChange(color))}
              />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {inherited && parent ? t("inheritedColor", { name: parent.name }) : <span className="font-mono uppercase">{swatch}</span>}
            </span>
            {parent && !inherited && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 text-muted-foreground"
                aria-label={t("inheritColor", { name: parent.name })}
                title={t("inheritColor", { name: parent.name })}
                onClick={() => (creating ? change({ color: null }) : void commit({ color: null }, { color: values.color }))}
              >
                <Pipette className="size-4" aria-hidden />
              </Button>
            )}
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <label className="flex shrink-0 cursor-pointer items-center gap-3 text-sm">
              {t("applyColor")}
              <Switch
                checked={values.apply_color}
                aria-label={t("applyColorFor", { name: values.name })}
                onCheckedChange={(on) => (creating ? change({ apply_color: on }) : void commit({ apply_color: on }, { apply_color: !on }))}
              />
            </label>
          </div>
        </SettingsSection>

        {creating ? (
          <div className="flex justify-end gap-2 border-t border-border pt-6">
            <Button type="button" variant="ghost" onClick={onBack}>{tCommon("cancel")}</Button>
            <Button type="button" disabled={!draft.name.trim() || submitting} onClick={() => void create()}>
              {submitting && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {tCommon("create")}
            </Button>
          </div>
        ) : (
          <GroupMembers
            worldId={worldId}
            group={group}
            groupsById={groupsById}
            personas={personas}
            index={index}
            onAssignmentsChange={onAssignmentsChange}
          />
        )}
      </FeaturePage>
    </div>
  );
}

/**
 * Les membres d'un groupe et l'ajout de plusieurs personas d'un coup. Un
 * persona peut appartenir à plusieurs groupes (migration 242) : chaque membre
 * dit quel groupe lui donne sa couleur, et peut en faire celui-ci.
 *
 * Après chaque écriture d'appartenance, les affectations sont relues : la
 * base tient seule le groupe principal (`lib/personaGroupMembership`).
 */
function GroupMembers({
  worldId,
  group,
  groupsById,
  personas,
  index,
  onAssignmentsChange,
}: {
  worldId: string;
  group: ResolvedPersonaGroup;
  groupsById: ReadonlyMap<string, ResolvedPersonaGroup>;
  personas: readonly GroupPersona[];
  index: PersonaGroupIndex;
  onAssignmentsChange: (rows: PersonaGroupAssignment[]) => void;
}) {
  const t = useTranslations("relations");
  const tNpc = useTranslations("personas.npc");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);

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
    <>
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
    </>
  );
}
