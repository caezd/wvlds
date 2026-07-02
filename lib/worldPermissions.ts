export type WorldRole = "owner" | "admin" | "editor" | "player" | "viewer";

// ── Niveau 1 : is_world_member ────────────────────────────────────────────────
// Tous les membres, quelle que soit leur rôle.

export function isWorldMember(
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return isWorldOwner || role !== null;
}

// ── Niveau 2 : is_world_editor ────────────────────────────────────────────────
// owner · admin · editor
// Accès en écriture au contenu : wiki, maps, chatrooms, catalogue, skills,
// onglets non-système, catégories de chatroom.

export function canEditContent(
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return isWorldOwner || role === "owner" || role === "admin" || role === "editor";
}

// ── Niveau 3 : is_world_admin ─────────────────────────────────────────────────
// owner · admin
// Gestion des membres, invitations, groupes de personas, paramètres du monde.

export function canManageWorld(
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return isWorldOwner || role === "owner" || role === "admin";
}

// ── Niveau 4 : is_world_owner ─────────────────────────────────────────────────
// owner uniquement (via world_members.role)
// Utilisé pour distinguer l'owner des admins quand c'est nécessaire (ex: quitter).

export function isWorldOwnerRole(role: WorldRole | string | null): boolean {
  return role === "owner";
}

// ── Règles dérivées ───────────────────────────────────────────────────────────

/**
 * Peut poster un message dans une chatroom.
 * viewer exclu : il peut lire et réagir, pas écrire.
 */
export function canMemberPost(
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return isWorldOwner || (role !== null && role !== "viewer");
}

/**
 * Peut quitter le monde.
 * L'owner ne peut pas quitter (il doit transférer ou supprimer).
 */
export function canLeaveWorld(
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return !isWorldOwner && role !== "owner";
}

/**
 * Peut modifier / supprimer une chatroom.
 * Créateur de la chatroom OU editor+.
 */
export function canEditChatroom(
  isCreator: boolean,
  role: WorldRole | string | null,
  isWorldOwner: boolean,
): boolean {
  return isCreator || canEditContent(role, isWorldOwner);
}

/**
 * Peut modifier les onglets système (is_system = true).
 * Réservé à l'owner direct (worlds.owner_id).
 */
export function canEditSystemTabs(isWorldOwner: boolean): boolean {
  return isWorldOwner;
}
