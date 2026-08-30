"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { ERR_ENREGISTREMENT, ERR_NON_AUTHENTIFIE , ERR_NON_AUTORISE } from "@/lib/actionErrors";

type Role = "admin" | "editor" | "player" | "viewer";

/**
 * Invite par courriel quelqu'un qui n'a pas encore de compte.
 *
 * Pour un utilisateur déjà inscrit, `WorldInviteDialog` écrit directement dans
 * `world_invitations` sous RLS ; on ne passe ici que lorsque la recherche n'a
 * trouvé personne.
 *
 * Deux points méritent l'attention :
 *
 * 1. **L'autorisation est explicite.** C'est la seule action du dépôt à passer
 *    par le `service_role`, qui contourne la RLS — le garde-fou habituel ne
 *    s'applique donc pas. Sans le contrôle ci-dessous, n'importe quel compte
 *    pouvait déclencher l'envoi d'un courriel d'invitation signé du projet,
 *    vers une adresse arbitraire, pour n'importe quel monde et n'importe quel
 *    rôle.
 *
 * 2. **Le rôle ne transite pas par les métadonnées du compte.** Il vivait
 *    auparavant dans `user_metadata.invited_role`, relu à l'acceptation. Or
 *    Supabase laisse l'utilisateur réécrire ses propres métadonnées
 *    (`auth.updateUser({ data })`) : elles ne peuvent porter aucune décision
 *    d'autorisation. L'invitation est donc enregistrée en base, sur le même
 *    chemin que l'invitation in-app — `accept_world_invitation` y lit le rôle,
 *    applique la vérification d'âge et écrit l'adhésion.
 */
export async function inviteUserToWorld(
  email: string,
  worldId: string,
  role: Role
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: ERR_NON_AUTHENTIFIE };

  // Lecture sous l'identité de l'appelant (donc sous RLS) : on ne peut pas
  // se déclarer administrateur d'un monde où l'on ne l'est pas.
  const { data: membership } = await supabase
    .from("world_members")
    .select("role")
    .eq("world_id", worldId)
    .eq("user_id", userId)
    .maybeSingle();

  const callerRole = (membership as { role?: string } | null)?.role;
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { error: ERR_NON_AUTORISE };
  }

  const admin = createAdminClient();

  // Pas de redirectTo : Supabase utilise le Site URL configuré dans le
  // dashboard. Le middleware renvoie vers /auth/login, qui détecte
  // type=invite dans le fragment et redirige vers /auth/invite.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) return { error: error.message };

  // L'API d'administration crée le compte immédiatement (non confirmé) :
  // son identifiant est disponible tout de suite, ce qui permet d'écrire une
  // invitation normale plutôt que de la faire transiter par le client.
  const inviteeId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (!inviteeId) {
    return { error: ERR_ENREGISTREMENT };
  }

  const { error: invErr } = await admin
    .from("world_invitations")
    .insert({ world_id: worldId, invitee_id: inviteeId, inviter_id: userId, role });
  if (invErr) return { error: invErr.message };

  // Sans notification, l'invité arrive dans l'application sans rien voir :
  // la carte d'invitation du panneau est rendue à partir d'une notification,
  // qui va ensuite lire `world_invitations` pour son statut et son rôle.
  const [{ data: world }, { data: inviter }] = await Promise.all([
    admin.from("worlds").select("name, icon_url, banner_url, description").eq("id", worldId).maybeSingle(),
    admin.from("profiles").select("username").eq("id", userId).maybeSingle(),
  ]);
  const w = world as { name?: string; icon_url?: string | null; banner_url?: string | null; description?: string | null } | null;

  const { error: notifErr } = await admin.from("notifications").insert({
    recipient_id: inviteeId,
    type: "world_invite",
    world_id: worldId,
    actor_id: userId,
    actor_name: (inviter as { username?: string | null } | null)?.username ?? null,
    content: w?.name ?? null,
    metadata: w
      ? { icon_url: w.icon_url, banner_url: w.banner_url, description: w.description }
      : null,
  });
  // L'invitation elle-même est enregistrée : une notification manquante gêne
  // l'invité sans lui interdire de rejoindre, on ne fait donc pas échouer
  // l'action pour autant.
  if (notifErr) console.error("Notification d'invitation non créée :", notifErr);

  return {};
}
