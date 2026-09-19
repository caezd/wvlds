"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, MoreHorizontal, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { canManageMember, canManageRole, rankOf, type WorldMembership, type WorldRoleRow } from "@/lib/worldPermissions";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { afterMenuClose } from "@/components/ui/after-menu-close";

/**
 * Le menu « ⋯ » d'une carte de membre : ses rôles à cocher, et son retrait.
 *
 * Chaque case écrit une ligne de `world_member_roles` ; la RLS refuse un rôle
 * au-dessus du rang du gestionnaire, ou un membre au-dessus de lui — l'UI
 * grise les mêmes cases pour ne pas promettre ce que la base refusera.
 */
export function MemberManageMenu({
  worldId,
  member,
  memberRoles,
  membership,
  allRoles,
  onRolesChanged,
  onRemoved,
  onChangeStatus,
}: {
  worldId: string;
  member: { user_id: string; username: string | null };
  /** Rôles actuellement portés par le membre. */
  memberRoles: WorldRoleRow[];
  /** Appartenance du gestionnaire. */
  membership: WorldMembership | null;
  allRoles: WorldRoleRow[];
  onRolesChanged: (userId: string, roleIds: string[]) => void;
  onRemoved: (userId: string) => void;
  /** Ouvre le dialogue de statut (en pause / absent) pour ce membre. */
  onChangeStatus?: () => void;
}) {
  const t = useTranslations("worlds.members");
  const supabase = useMemo(() => createClient(), []);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  const label = member.username ? `@${member.username}` : member.user_id.slice(0, 8);
  const targetRank = rankOf(memberRoles, false);
  const canTouch = canManageMember(membership, targetRank);
  const held = new Set(memberRoles.map((r) => r.id));

  async function toggleRole(role: WorldRoleRow, checked: boolean) {
    setBusyRoleId(role.id);
    const { error } = checked
      ? await supabase
          .from(TABLE.WORLD_MEMBER_ROLES)
          .insert({ world_id: worldId, user_id: member.user_id, role_id: role.id })
      : await supabase
          .from(TABLE.WORLD_MEMBER_ROLES)
          .delete()
          .eq("world_id", worldId)
          .eq("user_id", member.user_id)
          .eq("role_id", role.id);
    setBusyRoleId(null);
    if (error) {
      toast.error(t("roleChangeFailed"), { description: error.message });
      return;
    }
    const next = checked ? [...held, role.id] : [...held].filter((id) => id !== role.id);
    onRolesChanged(member.user_id, next);
  }

  async function removeMember() {
    const { error } = await supabase
      .from(TABLE.WORLD_MEMBERS)
      .delete()
      .eq("world_id", worldId)
      .eq("user_id", member.user_id);
    if (error) {
      toast.error(t("memberRemoveFailed"), { description: error.message });
      return;
    }
    toast.success(t("memberRemoved", { name: label }));
    onRemoved(member.user_id);
  }

  if (!canTouch) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("manageMember", { name: label })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("rolesLabel")}</DropdownMenuLabel>
          {allRoles.length === 0 && (
            <div className="px-2 py-1.5 text-xs italic text-muted-foreground">{t("noRoles")}</div>
          )}
          {allRoles.map((role) => (
            <DropdownMenuCheckboxItem
              key={role.id}
              checked={held.has(role.id)}
              disabled={!canManageRole(membership, role, "members.manage") || busyRoleId === role.id}
              // Le menu reste ouvert : on coche souvent plusieurs rôles d'affilée.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => void toggleRole(role, checked)}
            >
              <span className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
              <span className="truncate">{role.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          {onChangeStatus && (
            <DropdownMenuItem onSelect={afterMenuClose(onChangeStatus)}>
              <Clock className="mr-2 h-4 w-4" />
              {t("status.change")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={afterMenuClose(() => setConfirmRemove(true))}
          >
            <UserMinus className="mr-2 h-4 w-4" />
            {t("removeFromWorld")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("removeConfirmTitle", { name: label })}
        description={t("removeConfirmDescription")}
        confirmLabel={t("removeConfirm")}
        onConfirm={() => {
          setConfirmRemove(false);
          void removeMember();
        }}
      />
    </>
  );
}
