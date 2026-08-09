import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { TABLE } from "@/lib/constants";

const Body = z.object({ notificationId: z.string().uuid() });

// Appelée par le service worker (notificationclose, sans app ouverte) — même
// mise à jour que archiveNotifs(ids, true) dans NotificationsProvider.tsx.
// RLS "notifications: update own" (recipient_id = auth.uid()) scope déjà
// la ligne, pas besoin de filtrer sur recipient_id ici.
export async function POST(request: Request) {
    const supabase = await createClient();
    const userId = await getUserId(supabase);
    if (!userId) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({ error: "invalid_body" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
        .from(TABLE.NOTIFICATIONS)
        .update({ read_at: now, archived_at: now })
        .eq("id", parsed.data.notificationId);

if (error) {
        console.error("notifications mark-read update_failed:", error.message);
        return Response.json({ error: "update_failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
}
