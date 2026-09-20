"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Lock, Plus, Shapes, Trash2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { LabelWithHelp } from "./LabelWithHelp";
import { ColorPickerButton } from "./ColorPickerButton";
import { RoleChip } from "../members/RoleChip";

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

  const [roles, setRoles] = React.useState<WorldRoleRow[] | null>(null);
  const [counts, setCounts] = React.useState<Map<string, number>>(new Map());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

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

  async function togglePermission(role: WorldRoleRow, perm: WorldPermission, checked: boolean) {
    const next = checked ? [...new Set([...role.permissions, perm])] : role.permissions.filter((p) => p !== perm);
    await persist(role, { permissions: next });
  }

  if (roles === null) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{tCommon("loading")}</div>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 md:flex-row">
      {/* ── Liste ──────────────────────────────────────────── */}
      <aside className="w-full shrink-0 space-y-2 md:w-64">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <Button size="sm" variant="secondary" onClick={() => void createRole()}>
            <Plus className="mr-1 h-4 w-4" />
            {t("newRole")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("hierarchyHelp")}</p>
        <ul className="space-y-1" aria-label={t("title")}>
          {sorted.map((role) => {
            const editable = canManageRole(membership, role);
            const active = role.id === selectedId;
            return (
              <li key={role.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                    active ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <RoleChip role={role} plain className="text-sm" />
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{counts.get(role.id) ?? 0}</span>
                  {!editable && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t("locked")} />}
                </button>
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={tCommon("moveUp")}
                    disabled={!canMove(role, "up")}
                    onClick={() => void move(role, "up")}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={tCommon("moveDown")}
                    disabled={!canMove(role, "down")}
                    onClick={() => void move(role, "down")}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {sorted.length === 0 && <p className="text-xs italic text-muted-foreground">{t("empty")}</p>}
      </aside>

      {/* ── Fiche du rôle ──────────────────────────────────── */}
      {selected && (
        <section className="min-w-0 flex-1 space-y-5" aria-label={selected.name}>
          {!selectedEditable && (
            <p className="flex items-center gap-2 rounded-lg border border-border-soft bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {t("lockedHelp")}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-48 flex-1 gap-1.5">
              <Label htmlFor="role-name">{t("name")}</Label>
              <RoleNameInput
                key={selected.id}
                id="role-name"
                value={selected.name}
                disabled={!selectedEditable}
                onCommit={(name) => void persist(selected, { name })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("color")}</Label>
              <ColorPickerButton
                color={selected.color}
                disabled={!selectedEditable}
                onChange={(color) => void persist(selected, { color })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("icon")}</Label>
              <div className="flex items-center gap-1">
                <LucideIconPicker
                  value={selected.lucide_icon ?? ""}
                  accent={selected.color}
                  onChange={(name) => void persist(selected, { lucide_icon: name || null })}
                  trigger={
                    <button
                      type="button"
                      disabled={!selectedEditable}
                      aria-label={t("pickIcon")}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border shadow-sm hover:ring-2 hover:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selected.lucide_icon ? (
                        <LazyLucideIcon name={selected.lucide_icon} width={16} height={16} style={{ color: selected.color }} />
                      ) : (
                        <Shapes className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  }
                />
                {selected.lucide_icon && selectedEditable && (
                  <button
                    type="button"
                    aria-label={t("clearIcon")}
                    onClick={() => void persist(selected, { lucide_icon: null })}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ToggleRow
              id="role-hoist"
              label={t("hoist")}
              help={t("hoistHelp")}
              checked={selected.hoist}
              disabled={!selectedEditable}
              onChange={(hoist) => void persist(selected, { hoist })}
            />
            <ToggleRow
              id="role-mentionable"
              label={t("mentionable")}
              help={t("mentionableHelp")}
              checked={selected.mentionable}
              disabled={!selectedEditable}
              onChange={(mentionable) => void persist(selected, { mentionable })}
            />
            <ToggleRow
              id="role-default"
              label={t("isDefault")}
              help={t("isDefaultHelp")}
              checked={selected.is_default}
              disabled={!selectedEditable}
              onChange={(is_default) => void persist(selected, { is_default })}
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold">{t("permissionsTitle")}</h4>
            {(Object.keys(WORLD_PERMISSION_GROUPS) as WorldPermissionGroup[]).map((group) => (
              <fieldset key={group} className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`groups.${group}`)}
                </legend>
                {WORLD_PERMISSION_GROUPS[group].map((perm) => {
                  const isAdmin = selected.permissions.includes("administrator");
                  const checked = perm === "administrator" ? isAdmin : isAdmin || selected.permissions.includes(perm);
                  // `administrator` couvre tout : les autres cases se cochent d'elles-mêmes.
                  const implied = perm !== "administrator" && isAdmin;
                  const disabled = !selectedEditable || implied || !grantable.has(perm);
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-border-soft px-3 py-2",
                        disabled ? "opacity-70" : "cursor-pointer hover:bg-muted/30",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        aria-label={t(`permissions.${permissionI18nKey(perm)}.label`)}
                        onCheckedChange={(v) => void togglePermission(selected, perm, v === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">{t(`permissions.${permissionI18nKey(perm)}.label`)}</span>
                        <span className="block text-xs text-muted-foreground">{t(`permissions.${permissionI18nKey(perm)}.help`)}</span>
                        {!grantable.has(perm) && (
                          <span className="block text-xs italic text-muted-foreground">{t("notGrantable")}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>

          {selectedEditable && (
            <div className="border-t border-border-soft pt-4">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </Button>
              <DeleteConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t("deleteConfirmTitle", { name: selected.name })}
                description={t("deleteConfirmDescription", { count: counts.get(selected.id) ?? 0 })}
                onConfirm={() => {
                  setConfirmDelete(false);
                  void deleteRole(selected);
                }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Nom du rôle : enregistré à la sortie du champ ou sur Entrée, jamais à chaque frappe. */
function RoleNameInput({
  id,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
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
      id={id}
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
    />
  );
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-soft px-3 py-2">
      <LabelWithHelp help={help}>
        <Label htmlFor={id}>{label}</Label>
      </LabelWithHelp>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
