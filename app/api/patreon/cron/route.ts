import { NextResponse, type NextRequest } from "next/server";
import { isPatreonEnabled } from "@/lib/patreon/config";
import { resyncStalePatreonAccounts } from "@/lib/patreon/sync";

export const dynamic = "force-dynamic";
// Marge confortable : le resync enchaîne des appels réseau à Patreon.
export const maxDuration = 60;

/**
 * Cron de secours (déclenché par Vercel Cron). Rafraîchit les tokens et
 * resynchronise les mécénats des comptes non synchronisés depuis un moment,
 * pour rattraper un webhook manqué.
 *
 * Sécurité : Vercel Cron envoie `Authorization: Bearer ${CRON_SECRET}`. On
 * refuse tout appel sans ce secret (défini côté serveur, jamais NEXT_PUBLIC_).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  if (!isPatreonEnabled()) {
    return NextResponse.json({ skipped: "patreon disabled" });
  }

  const result = await resyncStalePatreonAccounts();
  return NextResponse.json(result);
}
