import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPatreonConfig } from "@/lib/patreon/config";
import { PATREON_SIGNATURE_HEADER, verifyWebhookSignature } from "@/lib/patreon/signature";
import { parseWebhookMember } from "@/lib/patreon/client";
import { syncPatreonEntitlement } from "@/lib/patreon/sync";

/**
 * Webhook Patreon (members:pledge:create/update/delete). Vérifie la signature
 * HMAC, retrouve l'utilisateur par son patreon_user_id et resynchronise le plan.
 *
 * Codes : 401 signature invalide, 400 payload illisible, 500 échec de synchro,
 * 200 sinon (y compris patron inconnu chez nous, pour que Patreon ne
 * re-tente pas indéfiniment un cas qui ne se résoudra jamais).
 */
export async function POST(request: NextRequest) {
  const { webhookSecret } = getPatreonConfig();

  // Corps BRUT indispensable : la signature porte sur les octets exacts reçus.
  const raw = await request.text();
  const signature = request.headers.get(PATREON_SIGNATURE_HEADER);

  if (!verifyWebhookSignature(raw, signature, webhookSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let membership;
  try {
    membership = parseWebhookMember(JSON.parse(raw));
  } catch {
    return new NextResponse("invalid payload", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("patreon_accounts")
    .select("user_id")
    .eq("patreon_user_id", membership.patreonUserId)
    .maybeSingle();

  // Mécène non lié chez nous : on acquitte sans rien faire.
  if (!account) return new NextResponse("ok", { status: 200 });

  try {
    await syncPatreonEntitlement({ userId: account.user_id, membership });
  } catch (err) {
    console.error("Patreon webhook sync error:", err);
    return new NextResponse("sync error", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
