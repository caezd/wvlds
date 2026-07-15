import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { isPatreonEnabled } from "@/lib/patreon/config";
import { buildAuthorizeUrl } from "@/lib/patreon/client";
import { signState } from "@/lib/patreon/state";

/**
 * Démarre la liaison Patreon : signe un `state` lié à l'utilisateur courant et
 * redirige vers la page d'autorisation Patreon.
 */
export async function GET(request: NextRequest) {
  if (!isPatreonEnabled()) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.redirect(buildAuthorizeUrl(signState(userId)));
}
