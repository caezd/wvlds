import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC } from "@/lib/constants";
import type { AppShellResult } from "@/types/db";

const EMPTY_SHELL: AppShellResult = {
  world_ids: [],
  world_unreads: [],
  room_unreads: [],
  notification_preferences: [],
  notifications: [],
  dm_conversations: [],
};

// NotificationsProvider et DmsProvider montent indépendamment (arbres de
// composants distincts) mais quasi simultanément au boot de l'app. Sans ce
// cache, chacun déclenche son propre appel réseau à get_app_shell() ; avec,
// le second consommateur récupère la promesse déjà en vol du premier.
let inFlight: { userId: string; promise: Promise<AppShellResult> } | null = null;

export function fetchAppShell(
  supabase: SupabaseClient,
  userId: string,
  notifLimit = 20,
): Promise<AppShellResult> {
  if (inFlight && inFlight.userId === userId) return inFlight.promise;

  // `.rpc()` renvoie un thenable (PostgrestFilterBuilder), pas un Promise —
  // Promise.resolve() normalise pour pouvoir chaîner `.finally()`.
  const promise = Promise.resolve(
    supabase.rpc(RPC.GET_APP_SHELL, { p_notif_limit: notifLimit }),
  ).then(({ data, error }): AppShellResult => {
    if (error || !data) return EMPTY_SHELL;
    return data as AppShellResult;
  });

  inFlight = { userId, promise };
  promise.finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });

  return promise;
}
