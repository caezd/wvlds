"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, CornerDownRight, FolderInput, Loader2, MoreHorizontal, Pipette, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";
import { keyboardMoves, planMove, type MoveCommand, type TreeNode } from "@/lib/wikiTreeMove";
import {
  PERSONA_ASSIGNMENT_COLUMNS,
  PERSONA_GROUP_COLUMNS,
  childrenOf,
  groupSubtreeIds,
  indexAssignments,
  normalizeGroupRow,
  resolvePersonaGroups,
  type PersonaGroupAssignment,
  type PersonaGroupRow,
} from "@/lib/personaGroups";
import { ColorPickerButton } from "./ColorPickerButton";
import { WorldGroupDetail, type GroupPersona } from "./WorldGroupDetail";
import { FeaturePage, SETTINGS_ROW, SettingsSection } from "./FeatureLayout";

/** Une ligne de la liste : bordée, sur le fond des cartes. */
const ROW = SETTINGS_ROW;
/** La ligne d'ajout, en pointillés. */
const ADD_ROW = "flex min-h-12 flex-wrap items-center gap-3 rounded-md border border-dashed border-border py-1.5 pl-3 pr-1.5";
/** Un champ sans cadre, dans une ligne. */
const BARE_INPUT = "h-8 min-w-32 flex-1 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none focus-visible:ring-0";
/** La pastille de couleur. */
const SWATCH = "size-6 rounded-md border-0 shadow-none";
/** Le retrait d'un sous-groupe, par niveau. */
const INDENT_REM = 1.5;

/** Les déplacements d'un cran, dans l'ordre du menu. */
const MOVES: { command: MoveCommand; Icon: React.ComponentType<{ className?: string }> }[] = [
  { command: "monter", Icon: ArrowUp },
  { command: "descendre", Icon: ArrowDown },
  { command: "entrer", Icon: FolderInput },
  { command: "sortir", Icon: ArrowLeft },
];

/** Tout groupe peut accueillir des sous-groupes : pour `wikiTreeMove`, chacun est un dossier. */
function asTree(rows: readonly PersonaGroupRow[]): TreeNode[] {
  return rows.map((g) => ({ id: g.id, parent_id: g.parent_id, is_folder: true, sort_index: g.sort_index }));
}

/**
 * L'onglet Groupes des réglages d'un monde (migration 232) : les groupes de
 * personas en arbre. Chaque ligne se modifie sur place — couleur, nom,
 * couleur appliquée ou non — et s'enregistre à la sortie du champ (la
 * couleur, un instant après le dernier réglage). Le menu d'une ligne ajoute
 * un sous-groupe, déplace d'un cran (même règle que l'arbre du wiki), rend la
 * couleur héritée ou supprime. Le nombre de membres d'une ligne ouvre la fiche
 * du groupe (`WorldGroupDetail`) : description et membres (migration 242).
 *
 * Un sous-groupe sans couleur propre prend celle de son parent ; supprimer un
 * groupe fait remonter ses sous-groupes d'un niveau (la base fait de même).
 */
export function WorldGroupsSettings({ worldId }: { worldId: string }) {
  const t = useTranslations("relations");
  const tWiki = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);

  const [rows, setRows] = React.useState<PersonaGroupRow[] | null>(null);
  const [assignments, setAssignments] = React.useState<PersonaGroupAssignment[]>([]);
  const [personas, setPersonas] = React.useState<GroupPersona[]>([]);
  // Le groupe dont la fiche est ouverte.
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data }, { data: assignRows }, { data: personaRows }] = await Promise.all([
        supabase.from("world_persona_groups").select(PERSONA_GROUP_COLUMNS).eq("world_id", worldId).order("sort_index"),
        supabase.from("persona_group_assignments").select(PERSONA_ASSIGNMENT_COLUMNS).eq("world_id", worldId),
        supabase
          .from("personas")
          .select("id, name, avatar_url, user_id, is_npc")
          .eq("world_id", worldId)
          .is("deleted_at", null)
          .not("is_template", "is", true)
          .order("name"),
      ]);
      if (cancelled) return;
      setRows(((data ?? []) as PersonaGroupRow[]).map(normalizeGroupRow));
      setAssignments((assignRows ?? []) as PersonaGroupAssignment[]);
      const raw = (personaRows ?? []) as Omit<GroupPersona, "username">[];
      // Le pseudo du joueur de chaque persona : la recherche porte aussi sur lui.
      const userIds = [...new Set(raw.map((p) => p.user_id))];
      const { data: profileRows } = userIds.length > 0
        ? await supabase.from("profiles").select("id, username").in("id", userIds)
        : { data: [] };
      if (cancelled) return;
      const usernames = new Map(((profileRows ?? []) as { id: string; username: string | null }[]).map((u) => [u.id, u.username]));
      setPersonas(raw.map((p) => ({ ...p, is_npc: !!p.is_npc, username: usernames.get(p.user_id) ?? null })));
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId]);

  const groups = React.useMemo(() => resolvePersonaGroups(rows ?? []), [rows]);
  const byId = React.useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const index = React.useMemo(() => indexAssignments(assignments), [assignments]);
  // Les membres directs de chaque groupe.
  const memberCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const ids of index.groupsByPersona.values()) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [index]);

  // Un nouveau groupe à la racine, ou un sous-groupe sous `addingUnder`.
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState<string>(DEFAULT_PLAYER_COLOR);
  const [addingUnder, setAddingUnder] = React.useState<string | null>(null);
  const [subName, setSubName] = React.useState("");
  const subInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!addingUnder) return;
    // Après la fermeture du menu, qui rend le focus à son bouton.
    const timer = setTimeout(() => subInput.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [addingUnder]);

  // La couleur s'enregistre un instant après le dernier réglage.
  const colorTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => {
    const timers = colorTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  function persistColorSoon(id: string, color: string) {
    const timers = colorTimers.current;
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => { timers.delete(id); void save(id, { color }); }, 400));
  }

  function edit(id: string, patch: Partial<PersonaGroupRow>) {
    setRows((prev) => prev?.map((g) => (g.id === id ? { ...g, ...patch } : g)) ?? null);
  }

  async function save(id: string, patch: Partial<Pick<PersonaGroupRow, "name" | "description" | "color" | "apply_color">>) {
    const { error } = await supabase.from("world_persona_groups").update(patch).eq("id", id);
    if (error) { toast.error(tCommon("saveError")); return false; }
    return true;
  }

  async function insert(values: Omit<PersonaGroupRow, "id" | "description">) {
    const { data, error } = await supabase
      .from("world_persona_groups")
      .insert({ world_id: worldId, ...values })
      .select(PERSONA_GROUP_COLUMNS)
      .single();
    if (error || !data) { toast.error(tCommon("saveError")); return false; }
    setRows((prev) => [...(prev ?? []), normalizeGroupRow(data as PersonaGroupRow)]);
    return true;
  }

  async function addRoot() {
    if (!newName.trim() || !rows) return;
    const ok = await insert({
      name: newName.trim(), color: newColor, parent_id: null,
      sort_index: childrenOf(rows, null).length, apply_color: true,
    });
    if (ok) setNewName("");
  }

  async function addSub(parentId: string) {
    const parent = byId.get(parentId);
    if (!subName.trim() || !rows || !parent) return;
    // Sans couleur propre : il prend celle de son parent, et l'applique comme lui.
    const ok = await insert({
      name: subName.trim(), color: null, parent_id: parentId,
      sort_index: childrenOf(rows, parentId).length, apply_color: parent.apply_color,
    });
    if (ok) { setSubName(""); setAddingUnder(null); }
  }

  async function remove(id: string) {
    if (!rows) return;
    const gone = rows.find((g) => g.id === id);
    if (!gone) return;
    const { error } = await supabase.from("world_persona_groups").delete().eq("id", id);
    if (error) { toast.error(tCommon("saveError")); return; }
    // Comme le trigger de la base : les sous-groupes remontent d'un niveau
    // et gardent la couleur qu'ils montraient.
    setRows((prev) => (prev ?? [])
      .filter((g) => g.id !== id)
      .map((g) => (g.parent_id === id ? { ...g, parent_id: gone.parent_id, color: g.color ?? gone.color } : g)));
    if (addingUnder === id) setAddingUnder(null);
  }

  async function move(id: string, command: MoveCommand) {
    if (!rows) return;
    const tree = asTree(rows);
    const target = keyboardMoves(tree, id)[command];
    if (!target) return;
    const writes = planMove(tree, id, target.targetId, target.zone);
    if (!writes || writes.length === 0) return;
    const previous = rows;
    const patch = new Map(writes.map((w) => [w.id, w]));
    setRows(rows.map((g) => {
      const w = patch.get(g.id);
      return w ? { ...g, parent_id: w.parent_id, sort_index: w.sort_index } : g;
    }));
    const { data, error } = await supabase.rpc("reorder_world_persona_groups", { p_items: writes });
    // La RLS ne lève pas d'erreur : elle ne touche aucune ligne (migration 224).
    if (error || data !== writes.length) {
      setRows(previous);
      toast.error(tCommon("saveError"));
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const open = openId ? byId.get(openId) : undefined;
  if (open) {
    return (
      <WorldGroupDetail
        worldId={worldId}
        group={open}
        groupsById={byId}
        personas={personas}
        index={index}
        onBack={() => setOpenId(null)}
        onEdit={(patch) => edit(open.id, patch)}
        onSave={(patch) => save(open.id, patch)}
        onAssignmentsChange={setAssignments}
      />
    );
  }

  const tree = asTree(rows);
  // La ligne d'ajout d'un sous-groupe se pose après toute la descendance de son parent.
  const subtree = addingUnder ? groupSubtreeIds(rows, addingUnder) : null;
  const addAfter = subtree ? [...groups].reverse().find((g) => subtree.has(g.id))?.id ?? null : null;

  return (
    <FeaturePage title={t("groups")}>
      <SettingsSection
        title={t("personaGroups")}
        help={t("groupsHelp")}
        meta={t("groupsCount", { count: rows.length })}
      >
        {rows.length === 0 && <p className="text-xs italic text-muted-foreground">{t("noGroupsDefined")}</p>}
        <ul className="space-y-2" aria-label={t("groups")}>
          {groups.map((g) => {
            const parent = g.parent_id ? byId.get(g.parent_id) : undefined;
            const moves = keyboardMoves(tree, g.id);
            const moveLabel = (command: MoveCommand) => {
              if (command === "monter") return tWiki("moveUp");
              if (command === "descendre") return tWiki("moveDown");
              if (command === "sortir") return t("moveOutOf", { name: parent?.name ?? "" });
              const into = moves.entrer ? byId.get(moves.entrer.targetId) : undefined;
              return t("moveInto", { name: into?.name ?? "" });
            };
            const inherited = g.color === null;
            return (
              <React.Fragment key={g.id}>
                <li
                  className={ROW}
                  style={{ marginLeft: `${g.depth * INDENT_REM}rem` }}
                  data-group-id={g.id}
                  data-depth={g.depth}
                  aria-level={g.depth + 1}
                >
                  {g.depth > 0 && <CornerDownRight className="-mr-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <div
                    className={cn("flex rounded-md", inherited && "outline-1 outline-offset-2 outline-dashed outline-muted-foreground/60")}
                    title={inherited && parent ? t("inheritedColor", { name: parent.name }) : undefined}
                    data-inherited={inherited || undefined}
                  >
                    <ColorPickerButton
                      color={g.swatch ?? DEFAULT_PLAYER_COLOR}
                      className={SWATCH}
                      onChange={(color) => {
                        edit(g.id, { color });
                        persistColorSoon(g.id, color);
                      }}
                    />
                  </div>
                  <Input
                    value={g.name}
                    aria-label={t("groupName")}
                    className={BARE_INPUT}
                    onChange={(e) => edit(g.id, { name: e.target.value })}
                    onBlur={(e) => { if (e.target.value.trim()) void save(g.id, { name: e.target.value.trim() }); }}
                  />
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground")}
                    aria-label={t("openGroup", { name: g.name })}
                    onClick={() => setOpenId(g.id)}
                  >
                    <Users className="size-3.5" aria-hidden />
                    {t("memberCount", { count: memberCount.get(g.id) ?? 0 })}
                  </button>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    {t("applyColor")}
                    <Switch
                      checked={g.apply_color}
                      aria-label={t("applyColorFor", { name: g.name })}
                      onCheckedChange={async (on) => {
                        edit(g.id, { apply_color: on });
                        if (!(await save(g.id, { apply_color: on }))) edit(g.id, { apply_color: !on });
                      }}
                    />
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-8 text-muted-foreground")}
                        aria-label={t("groupActions", { name: g.name })}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => { setSubName(""); setAddingUnder(g.id); }}>
                        <Plus className="mr-2 size-4" /> {t("addSubgroup")}
                      </DropdownMenuItem>
                      {MOVES.some(({ command }) => moves[command]) && <DropdownMenuSeparator />}
                      {MOVES.filter(({ command }) => moves[command]).map(({ command, Icon }) => (
                        <DropdownMenuItem key={command} onClick={() => void move(g.id, command)}>
                          <Icon className="mr-2 size-4" /> {moveLabel(command)}
                        </DropdownMenuItem>
                      ))}
                      {parent && !inherited && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              const before = g.color;
                              edit(g.id, { color: null });
                              if (!(await save(g.id, { color: null }))) edit(g.id, { color: before });
                            }}
                          >
                            <Pipette className="mr-2 size-4" /> {t("inheritColor", { name: parent.name })}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void remove(g.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" /> {t("deleteGroup", { name: g.name })}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {g.description && (
                    <p className="w-full truncate pb-1 pl-9 text-xs text-muted-foreground">{g.description}</p>
                  )}
                </li>
                {addingUnder && addAfter === g.id && (
                  <li
                    className={ADD_ROW}
                    style={{ marginLeft: `${((byId.get(addingUnder)?.depth ?? 0) + 1) * INDENT_REM}rem` }}
                  >
                    <CornerDownRight className="-mr-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      ref={subInput}
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addSub(addingUnder);
                        if (e.key === "Escape") setAddingUnder(null);
                      }}
                      placeholder={t("subgroupNamePlaceholder")}
                      aria-label={t("subgroupNamePlaceholder")}
                      className={cn(BARE_INPUT, "font-normal")}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAddingUnder(null)}>
                      {tCommon("cancel")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!subName.trim()}
                      aria-label={t("addSubgroupTo", { name: byId.get(addingUnder)?.name ?? "" })}
                      onClick={() => void addSub(addingUnder)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {tCommon("add")}
                    </Button>
                  </li>
                )}
              </React.Fragment>
            );
          })}
        </ul>
        <div className={ADD_ROW}>
          <ColorPickerButton color={newColor} onChange={setNewColor} className={SWATCH} />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addRoot(); }}
            placeholder={t("groupNamePlaceholder")}
            aria-label={t("groupNamePlaceholder")}
            className={cn(BARE_INPUT, "font-normal")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!newName.trim()}
            aria-label={t("addGroup")}
            onClick={() => void addRoot()}
          >
            <Plus className="size-3.5" aria-hidden />
            {tCommon("add")}
          </Button>
        </div>
      </SettingsSection>
    </FeaturePage>
  );
}
