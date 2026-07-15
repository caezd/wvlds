import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { isPatreonEnabled } from "@/lib/patreon/config";
import { exchangeCode, fetchMembership } from "@/lib/patreon/client";
import { verifyState } from "@/lib/patreon/state";
import { syncPatreonEntitlement, PatreonAlreadyLinkedError } from "@/lib/patreon/sync";

/** Redirige vers /settings avec un statut lisible par l'UI. */
function back(request: NextRequest, status: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("patreon", status);
  return NextResponse.redirect(url);
}

/**
 * Retour de l'autorisation Patreon : vérifie le `state`, échange le code,
 * lit le mécénat et applique le plan.
 */
export async function GET(request: NextRequest) {
  if (!isPatreonEnabled()) return back(request, "error");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // L'utilisateur a refusé l'autorisation, ou paramètres manquants.
  if (!code || !state) return back(request, "cancelled");

  const verified = verifyState(state);
  if (!verified) return back(request, "error");

  // Le state doit correspondre à la session courante (anti-vol de compte).
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId || userId !== verified.userId) return back(request, "error");

  try {
    const tokens = await exchangeCode(code);
    const membership = await fetchMembership(tokens.accessToken);
    await syncPatreonEntitlement({ userId, membership, tokens });
    return back(request, "linked");
  } catch (err) {
    if (err instanceof PatreonAlreadyLinkedError) return back(request, "already_linked");
    console.error("Patreon callback error:", err);
    return back(request, "error");
  }
}
