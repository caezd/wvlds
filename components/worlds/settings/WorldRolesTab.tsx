"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Crown, Lock, Plus, Shapes, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  WORLD_PERMISSION_GROUPS,
  canManageRole,
  grantablePermissions,
  permissionI18nKey,
  sortRolesByPosition,
  type WorldPermission,
  type WorldPermissionGroup,
  type WorldRoleRow,
} from "@/lib/worldPermissions";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useMediaQuery, MEDIA } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { ColorPickerButton } from "./ColorPickerButton";
import { FIELD, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";
import { RoleChip } from "../members/RoleChip";
import { HelpHint } from "@/components/ui/help-hint";

const ROLE_SELECT = "id, world_id, name, color, lucide_icon, position, permissions, is_default, mentionable, hoist";
const NEW_ROLE_COLOR = "#94a3b8";

/**
 * Les rôles du monde : leur ordre, leur apparence, leurs permissions.
 *
 * Tout s'enregistre au fil de l'eau, champ par champ, sous RLS : un rôle au
 * niveau ou au-dessus du rang du lecteur est affiché mais verrouillé, et une
 * permission qu'il ne possède pas lui-même ne peut pas être cochée — la base
 * refuserait, autant ne pas le promettre.
 */
export function WorldRolesTab({ worldId }: { worldId: string }) {
  const t = useTranslations("worlds.roles");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const { membership, refresh } = useWorldMembership();
  // Deux colonnes sur un écran large ; en dessous, chaque rôle se déplie sur
  // place — une fiche aussi longue, poussée sous une liste, se perdait.
  const deuxColonnes = useMediaQuery(MEDIA.md);

  const [roles, setRoles] = React.useState<WorldRoleRow[] | null>(null);
  const [counts, setCounts] = React.useState<Map<string, number>>(new Map());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const grantable = grantablePermissions(membership);
  const sorted = React.useMemo(() => sortRolesByPosition(roles ?? []), [roles]);
  const selected = sorted.find((r) => r.id === selectedId) ?? null;
  const selectedEditable = !!selected && canManageRole(membership, selected);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data, error }, { data: assignments, error: assignError }] = await Promise.all([
        supabase.from(TABLE.WORLD_ROLES).select(ROLE_SELECT).eq("world_id", worldId),
        supabase.from(TABLE.WORLD_MEMBER_ROLES).select("role_id").eq("world_id", worldId),
      ]);
      if (cancelled) return;
      if (error) toast.error(error.message);
      if (assignError) console.error("[WorldRolesTab] attributions illisibles :", assignError.message);
      const list = (data ?? []) as WorldRoleRow[];
      setRoles(list);
      const map = new Map<string, number>();
      for (const a of (assignments ?? []) as { role_id: string }[]) map.set(a.role_id, (map.get(a.role_id) ?? 0) + 1);
      setCounts(map);
      setSelectedId((cur) => cur ?? sortRolesByPosition(list)[0]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  /** Écrit un champ, met la liste à jour, prévient le reste du monde. */
  async function persist(role: WorldRoleRow, patch: Partial<WorldRoleRow>) {
    const previous = roles;
    setRoles((prev) => prev?.map((r) => (r.id === role.id ? { ...r, ...patch } : r)) ?? null);
    const { error } = await supabase.from(TABLE.WORLD_ROLES).update(patch).eq("id", role.id);
    if (error) {
      setRoles(previous);
      toast.error(t("saveFailed"), { description: error.message });
      return false;
    }
    refresh();
    return true;
  }

  async function createRole() {
    if (!roles) return;
    // Sous tous les rôles existants : le nouveau rôle ne prend le pas sur
    // aucun autre tant qu'on ne l'a pas remonté.
    const position = Math.min(0, ...roles.map((r) => r.position)) - (roles.some((r) => r.position <= 0) ? 1 : 0);
    const { data, error } = await supabase
      .from(TABLE.WORLD_ROLES)
      .insert({ world_id: worldId, name: uniqueName(t("newRoleName")), color: NEW_ROLE_COLOR, position })
      .select(ROLE_SELECT)
      .single();
    if (error) {
      toast.error(t("createFailed"), { description: error.message });
      return;
    }
    const created = data as WorldRoleRow;
    setRoles([...roles, created]);
    setSelectedId(created.id);
    refresh();
  }

  function uniqueName(base: string) {
    const taken = new Set((roles ?? []).map((r) => r.name));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  async function deleteRole(role: WorldRoleRow) {
    const { error } = await supabase.from(TABLE.WORLD_ROLES).delete().eq("id", role.id);
    if (error) {
      toast.error(t("deleteFailed"), { description: error.message });
      return;
    }
    setRoles((prev) => prev?.filter((r) => r.id !== role.id) ?? null);
    setSelectedId((cur) => (cur === role.id ? null : cur));
    refresh();
  }

  /**
   * Monte ou descend d'un cran dans la hiérarchie. Les positions ne sont pas
   * forcément contiguës : deux voisins de même position se départagent par le
   * nom, on donne alors au rôle déplacé une position franchement au-dessus (ou
   * en dessous) de son voisin.
   */
  async function move(role: WorldRoleRow, dir: "up" | "down") {
    const idx = sorted.findIndex((r) => r.id === role.id);
    const neighbor = sorted[dir === "up" ? idx - 1 : idx + 1];
    if (!neighbor || !canManageRole(membership, neighbor)) return;
    if (role.position !== neighbor.position) {
      // Échange : deux écritures, la seconde annule la première si elle échoue.
      const ok = await persist(role, { position: neighbor.position });
      if (!ok) return;
      const ok2 = await persist(neighbor, { position: role.position });
      if (!ok2) await persist(role, { position: role.position });
      return;
    }
    await persist(role, { position: dir === "up" ? neighbor.position + 1 : neighbor.position - 1 });
  }

  function canMove(role: WorldRoleRow, dir: "up" | "down") {
    if (!canManageRole(membership, role)) return false;
    const idx = sorted.findIndex((r) => r.id === role.id);
    const neighbor = sorted[dir === "up" ? idx - 1 : idx + 1];
    if (!neighbor || !canManageRole(membership, neighbor)) return false;
    // Monter au-dessus d'un voisin de même position demande `position + 1`,
    // que la RLS refuse si cela atteint le rang du lecteur.
    if (dir === "up" && role.position === neighbor.position && neighbor.position + 1 >= (membership?.rank ?? -1)) return false;
    return true;
  }

  /** Accorde (ou retire) d'un coup une ou plusieurs permissions : le tableau complet est réécrit. */
  async function setPermissions(role: WorldRoleRow, perms: WorldPermission[], checked: boolean) {
    const next = checked
      ? [...new Set([...role.permissions, ...perms])]
      : role.permissions.filter((p) => !(perms as string[]).includes(p));
    await persist(role, { permissions: next });
  }

  if (roles === null) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{tCommon("loading")}</div>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:gap-10">
      {/* ── Liste ──────────────────────────────────────────── */}
      <aside className={cn("w-full shrink-0", deuxColonnes && "md:w-56 md:border-r md:border-border-soft md:pr-4")}>
        <div className="flex items-center justify-between gap-2 pb-2 pl-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>
              {t("title")} · <span className="tabular-nums">{sorted.length}</span>
            </span>
            <HelpHint title={t("title")}>{t("hierarchyHelp")}</HelpHint>
          </p>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("newRole")}
            title={t("newRole")}
            onClick={() => void createRole()}
            className={cn("size-7 rounded-md", FIELD)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <ul className="space-y-0.5" aria-label={t("title")}>
          {sorted.map((role) => {
            const editable = canManageRole(membership, role);
            const active = role.id === selectedId;
            const deplie = active && !deuxColonnes;
            return (
              <li key={role.id}>
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-r-md border-l-2 pr-1 transition-colors",
                    active ? "border-accent bg-muted" : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId((cur) => (!deuxColonnes && cur === role.id ? null : role.id))}
                    aria-current={active ? "true" : undefined}
                    aria-expanded={deuxColonnes ? undefined : active}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-sm",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <RoleChip role={role} plain size="md" className="text-sm" />
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground",
                        active ? "bg-background" : "bg-muted",
                      )}
                    >
                      {counts.get(role.id) ?? 0}
                    </span>
                    {!editable && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t("locked")} />}
                    {/* Le chevron ne paraît que là où la ligne se déplie. */}
                    {!deuxColonnes && (
                      <ChevronDown
                        aria-hidden
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", active && "rotate-180")}
                      />
                    )}
                  </button>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={tCommon("moveUp")}
                      disabled={!canMove(role, "up")}
                      onClick={() => void move(role, "up")}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={tCommon("moveDown")}
                      disabled={!canMove(role, "down")}
                      onClick={() => void move(role, "down")}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                </div>

                {deplie && (
                  <section aria-label={role.name} className="@container px-1 py-4">
                    <RoleDetails
                      key={role.id}
                      role={role}
                      editable={editable}
                      grantable={grantable}
                      memberCount={counts.get(role.id) ?? 0}
                      onPersist={(patch) => void persist(role, patch)}
                      onSetPermissions={(perms, checked) => void setPermissions(role, perms, checked)}
                      onDelete={() => void deleteRole(role)}
                    />
                  </section>
                )}
              </li>
            );
          })}
        </ul>
        {sorted.length === 0 && <p className="px-2.5 text-xs italic text-muted-foreground">{t("empty")}</p>}
      </aside>

      {/* ── Fiche du rôle, colonne de droite ───────────────── */}
      {deuxColonnes && selected && (
        <section className="@container min-w-0 flex-1" aria-label={selected.name}>
          <RoleDetails
            key={selected.id}
            role={selected}
            editable={selectedEditable}
            grantable={grantable}
            memberCount={counts.get(selected.id) ?? 0}
            onPersist={(patch) => void persist(selected, patch)}
            onSetPermissions={(perms, checked) => void setPermissions(selected, perms, checked)}
            onDelete={() => void deleteRole(selected)}
          />
        </section>
      )}
    </div>
  );
}


/**
 * La fiche d'un rôle : son en-tête (couleur, icône, nom), ses options
 * d'affichage, ses permissions par groupe.
 *
 * Elle se rend à deux places selon la largeur — la colonne de droite sur un
 * grand écran, le dépli de la ligne sur un petit — d'où ce composant à part
 * plutôt que deux copies du même formulaire.
 */
function RoleDetails({
  role,
  editable,
  grantable,
  memberCount,
  onPersist,
  onSetPermissions,
  onDelete,
}: {
  role: WorldRoleRow;
  editable: boolean;
  grantable: ReadonlySet<WorldPermission>;
  memberCount: number;
  onPersist: (patch: Partial<WorldRoleRow>) => void;
  onSetPermissions: (perms: WorldPermission[], checked: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("worlds.roles");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const isAdmin = role.permissions.includes("administrator");
  /** Accordée, soit d'elle-même, soit par `administrator` qui couvre tout. */
  const isChecked = (perm: WorldPermission) => (perm === "administrator" ? isAdmin : isAdmin || role.permissions.includes(perm));
  /** Couverte par `administrator` : l'interrupteur n'a plus d'effet. */
  const isImplied = (perm: WorldPermission) => perm !== "administrator" && isAdmin;
  const isSettable = (perm: WorldPermission) => editable && !isImplied(perm) && grantable.has(perm);

  const summary = [
    t("membersCount", { count: memberCount }),
    isAdmin ? t("allPermissions") : t("permissionsCount", { count: role.permissions.length }),
  ].join(" · ");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* La pastille de couleur, grande, porte l'icône du rôle. */}
        <ColorPickerButton
          color={role.color}
          disabled={!editable}
          onChange={(color) => onPersist({ color })}
          className="size-12 rounded-md border-0 text-white shadow-none"
        >
          {role.lucide_icon ? (
            <LazyLucideIcon name={role.lucide_icon} width={22} height={22} aria-hidden />
          ) : (
            <Shapes className="size-5 opacity-80" aria-hidden />
          )}
        </ColorPickerButton>
        <div className="min-w-0 flex-1 basis-48">
          <RoleNameInput value={role.name} disabled={!editable} onCommit={(name) => onPersist({ name })} />
          <p className="px-2 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex items-center gap-1">
          <LucideIconPicker
            value={role.lucide_icon ?? ""}
            accent={role.color}
            onChange={(name) => onPersist({ lucide_icon: name || null })}
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={!editable} className={cn("rounded-md", FIELD)}>
                <Shapes className="size-4" />
                {t("icon")}
              </Button>
            }
          />
          {role.lucide_icon && editable && (
            <button
              type="button"
              aria-label={t("clearIcon")}
              onClick={() => onPersist({ lucide_icon: null })}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
          {editable && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </Button>
              <DeleteConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t("deleteConfirmTitle", { name: role.name })}
                description={t("deleteConfirmDescription", { count: memberCount })}
                onConfirm={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
              />
            </>
          )}
        </div>
      </header>

      {!editable && (
        <p className="flex items-center gap-2 rounded-md border border-border-soft bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {t("lockedHelp")}
        </p>
      )}

      <SettingsSection title={t("display")}>
        <ToggleList>
          <ToggleItem
            title={t("hoist")}
            help={t("hoistHelp")}
            checked={role.hoist}
            disabled={!editable}
            onCheckedChange={(hoist) => onPersist({ hoist })}
          />
          <ToggleItem
            title={t("mentionable")}
            help={t("mentionableHelp")}
            checked={role.mentionable}
            disabled={!editable}
            onCheckedChange={(mentionable) => onPersist({ mentionable })}
          />
          <ToggleItem
            title={t("isDefault")}
            help={t("isDefaultHelp")}
            checked={role.is_default}
            disabled={!editable}
            onCheckedChange={(is_default) => onPersist({ is_default })}
          />
        </ToggleList>
      </SettingsSection>

      {(Object.keys(WORLD_PERMISSION_GROUPS) as WorldPermissionGroup[]).map((group) => {
        const perms = WORLD_PERMISSION_GROUPS[group];
        const onCount = perms.filter(isChecked).length;
        const allOn = onCount === perms.length;
        // « Tout désactiver » retire ce que le rôle porte lui-même ; « Tout
        // activer » accorde ce que le lecteur peut conférer. Sans effet, grisé.
        const targets = perms.filter((p) => isSettable(p) && role.permissions.includes(p) === allOn);
        return (
          <SettingsSection
            key={group}
            title={t(`groups.${group}`)}
            meta={t("countOf", { count: onCount, total: perms.length })}
            aside={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={targets.length === 0}
                onClick={() => onSetPermissions(targets, !allOn)}
                className={cn("mt-2 h-7 rounded-md px-2.5 text-xs", FIELD)}
              >
                {allOn ? t("disableAll") : t("enableAll")}
              </Button>
            }
          >
            <ToggleList>
              {perms.map((perm) => {
                const label = t(`permissions.${permissionI18nKey(perm)}.label`);
                const implied = isImplied(perm);
                return (
                  <ToggleItem
                    key={perm}
                    title={label}
                    icon={perm === "administrator" ? <Crown className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden /> : undefined}
                    badge={
                      implied ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("included")}
                        </span>
                      ) : undefined
                    }
                    description={
                      <>
                        {t(`permissions.${permissionI18nKey(perm)}.help`)}
                        {!grantable.has(perm) && <span className="block italic">{t("notGrantable")}</span>}
                      </>
                    }
                    dimmed={implied}
                    checked={isChecked(perm)}
                    disabled={!isSettable(perm)}
                    onCheckedChange={(checked) => onSetPermissions([perm], checked)}
                  />
                );
              })}
            </ToggleList>
          </SettingsSection>
        );
      })}
    </div>
  );
}

/** Nom du rôle, en titre de la fiche : enregistré à la sortie du champ ou sur Entrée, jamais à chaque frappe. */
function RoleNameInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
  const t = useTranslations("worlds.roles");
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  function commit() {
    const name = draft.trim();
    if (!name || name === value) {
      setDraft(value);
      return;
    }
    onCommit(name);
  }
  return (
    <Input
      aria-label={t("name")}
      value={draft}
      maxLength={40}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      // Un titre qu'on modifie sur place : sa bordure ne paraît qu'au survol.
      className="h-9 rounded-md border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight shadow-none hover:border-border-soft focus-visible:border-border-soft disabled:opacity-100 md:text-xl dark:bg-transparent"
    />
  );
}
