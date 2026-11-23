import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fichiers effacés par appel à l'API du stockage. */
const BATCH = 100;

/**
 * Ménage quotidien (Vercel Cron) des images d'annonces abandonnées
 * (migration 236) : téléversées il y a plus d'un jour et désignées par aucune
 * annonce ni aucun envoi programmé en attente. Rattrape ce que l'application
 * n'efface pas sur le moment — un onglet fermé avant l'envoi, l'image
 * remplacée sur l'annonce d'un autre membre de l'équipe.
 *
 * Sécurité : comme `/api/patreon/cron`, n'accepte que
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("orphan_announcement_images");
  if (error) {
    console.error("[cron announcement-images] liste", error);
    return NextResponse.json({ error: "list failed" }, { status: 500 });
  }
  const names = ((data ?? []) as unknown[]).filter((n): n is string => typeof n === "string" && n.length > 0);

  let removed = 0;
  let failed = 0;
  for (let i = 0; i < names.length; i += BATCH) {
    const lot = names.slice(i, i + BATCH);
    const { error: removeError } = await admin.storage.from("worlds").remove(lot);
    if (removeError) {
      console.error("[cron announcement-images] suppression", removeError);
      failed += lot.length;
    } else {
      removed += lot.length;
    }
  }
  return NextResponse.json({ found: names.length, removed, failed }, { status: failed > 0 && removed === 0 ? 500 : 200 });
}
