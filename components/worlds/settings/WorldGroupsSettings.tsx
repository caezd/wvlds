"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, CornerDownRight, FolderInput, Loader2, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
  indexAssignments,
  normalizeGroupRow,
  resolvePersonaGroups,
  type PersonaGroupAssignment,
  type PersonaGroupRow,
} from "@/lib/personaGroups";
import { WorldGroupDetail, type GroupFields, type GroupPersona } from "./WorldGroupDetail";
import { FeaturePage, SETTINGS_ROW, SettingsSection } from "./FeatureLayout";

/** Une ligne de la liste : bordée, sur le fond des cartes ; le bouton qu'elle contient l'occupe. */
const ROW = cn(SETTINGS_ROW, "flex-nowrap gap-1 py-1 pl-1");
/** Le bouton d'une ligne, qui ouvre la page du groupe. */
const ROW_BUTTON =
  "flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** La ligne d'ajout, en pointillés. */
const ADD_ROW =
  "flex min-h-12 w-full items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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

/** La page ouverte : celle d'un groupe, ou celle d'un groupe à créer (sous `parentId`). */
type OpenPage = { id: string } | { parentId: string | null };

/**
 * L'onglet Groupes des réglages d'un monde (migration 232) : les groupes de
 * personas en arbre. Une ligne ouvre la page du groupe (`WorldGroupDetail`),
 * où il se règle — nom, description, couleur, membres — et où se crée un
 * groupe ou un sous-groupe. Le menu d'une ligne garde ce qui se fait vite :
 * déplacer d'un cran (même règle que l'arbre du wiki) et supprimer.
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
  const [page, setPage] = React.useState<OpenPage | null>(null);

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

  async function save(id: string, patch: Partial<GroupFields>) {
    const { error } = await supabase.from("world_persona_groups").update(patch).eq("id", id);
    if (error) { toast.error(tCommon("saveError")); return false; }
    return true;
  }

  /** Crée le groupe à la fin de son parent, puis ouvre sa page. */
  async function create(parentId: string | null, values: GroupFields) {
    if (!rows) return false;
    const { data, error } = await supabase
      .from("world_persona_groups")
      .insert({ world_id: worldId, ...values, parent_id: parentId, sort_index: childrenOf(rows, parentId).length })
      .select(PERSONA_GROUP_COLUMNS)
      .single();
    if (error || !data) { toast.error(tCommon("saveError")); return false; }
    const row = normalizeGroupRow(data as PersonaGroupRow);
    setRows((prev) => [...(prev ?? []), row]);
    setPage({ id: row.id });
    return true;
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

  const group = page && "id" in page ? byId.get(page.id) ?? null : null;
  // La page d'un groupe disparu entre-temps laisse place à la liste.
  if (page && ("parentId" in page || group)) {
    const parentId = "parentId" in page ? page.parentId : group?.parent_id ?? null;
    return (
      <WorldGroupDetail
        // Une autre page repart de zéro (brouillon, champs).
        key={"id" in page ? page.id : `new:${page.parentId ?? ""}`}
        worldId={worldId}
        group={group}
        parent={parentId ? byId.get(parentId) : undefined}
        groupsById={byId}
        personas={personas}
        index={index}
        onBack={() => setPage(null)}
        onEdit={(patch) => { if (group) edit(group.id, patch); }}
        onSave={(patch) => (group ? save(group.id, patch) : Promise.resolve(false))}
        onColorChange={(color) => {
          if (!group) return;
          edit(group.id, { color });
          persistColorSoon(group.id, color);
        }}
        onCreate={(values) => create(parentId, values)}
        onAssignmentsChange={setAssignments}
      />
    );
  }

  const tree = asTree(rows);

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
            const inherited = g.color === null && !!parent;
            return (
              <li
                key={g.id}
                className={ROW}
                style={{ marginLeft: `${g.depth * INDENT_REM}rem` }}
                data-group-id={g.id}
                data-depth={g.depth}
                aria-level={g.depth + 1}
              >
                <button
                  type="button"
                  className={ROW_BUTTON}
                  aria-label={t("openGroup", { name: g.name })}
                  onClick={() => setPage({ id: g.id })}
                >
                  {g.depth > 0 && <CornerDownRight className="-mr-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span
                    className={cn(
                      "size-6 shrink-0 rounded-md",
                      inherited && "outline-1 outline-offset-2 outline-dashed outline-muted-foreground/60",
                    )}
                    style={{ backgroundColor: g.swatch ?? DEFAULT_PLAYER_COLOR }}
                    title={inherited && parent ? t("inheritedColor", { name: parent.name }) : undefined}
                    data-group-swatch
                    data-inherited={inherited || undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" data-group-name>{g.name}</span>
                    {g.description && <span className="block truncate text-xs text-muted-foreground">{g.description}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" aria-hidden />
                    {t("memberCount", { count: memberCount.get(g.id) ?? 0 })}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-8 shrink-0 text-muted-foreground")}
                      aria-label={t("groupActions", { name: g.name })}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setPage({ parentId: g.id })}>
                      <Plus className="mr-2 size-4" /> {t("addSubgroup")}
                    </DropdownMenuItem>
                    {MOVES.some(({ command }) => moves[command]) && <DropdownMenuSeparator />}
                    {MOVES.filter(({ command }) => moves[command]).map(({ command, Icon }) => (
                      <DropdownMenuItem key={command} onClick={() => void move(g.id, command)}>
                        <Icon className="mr-2 size-4" /> {moveLabel(command)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void remove(g.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" /> {t("deleteGroup")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
        <button type="button" className={ADD_ROW} onClick={() => setPage({ parentId: null })}>
          <Plus className="size-4" aria-hidden />
          {t("newGroup")}
        </button>
      </SettingsSection>
    </FeaturePage>
  );
}
