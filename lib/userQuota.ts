// lib/userQuota.ts
// Utilitaires quotas (worlds/personas)
// Usage (RSC / serveur) :
//   const { plan, owned, quotaLimit, quotaReached } = await getUserQuotaServer('worlds');
// Usage (client) :
//   const { plan, owned, quotaLimit, quotaReached } = await getUserQuotaClient('worlds');

import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_PERSONAS_PER_WORLD } from "@/lib/personaQuotaConstants";

export type Plan = "free" | "subscribed" | "lifetime";
export type Resource = "worlds" | "personas";

// Ré-exportée pour compatibilité (lib/personaErrors.ts et code existant) —
// la valeur elle-même vit dans lib/personaQuotaConstants.ts (zéro dépendance,
// importable depuis un composant client sans entraîner next/headers).
export { FREE_PERSONAS_PER_WORLD };

export type Quota = {
    plan: Plan;
    owned: number;
    quotaLimit: number; // Infinity = illimité
    quotaReached: boolean; // true si owned >= quotaLimit (et quotaLimit fini)
};

// Règles par ressource (facile à étendre)
// subscribed et lifetime sont tous deux illimités.
const QUOTA_LIMITS: Record<Resource, Record<Plan, number>> = {
    worlds: { free: 1, subscribed: Infinity, lifetime: Infinity },
    personas: { free: FREE_PERSONAS_PER_WORLD, subscribed: Infinity, lifetime: Infinity },
};

function limitFor(plan: Plan, kind: Resource): number {
    return QUOTA_LIMITS[kind]?.[plan] ?? Infinity;
}

function reached(owned: number, limit: number): boolean {
    return Number.isFinite(limit) ? owned >= limit : false;
}

/** Noyau réutilisable si tu as déjà un client Supabase */
export async function getUserQuotaWithClient(
    supabase: SupabaseClient,
    userId?: string | null,
    kind: Resource = "worlds"
): Promise<Quota> {
    const fallback: Quota = {
        plan: "free",
        owned: 0,
        quotaLimit: limitFor("free", kind),
        quotaReached: false,
    };

    // Récupère l'utilisateur si pas fourni
    let uid = userId ?? null;
    if (!uid) {
        const { data } = await supabase.auth.getUser();
        uid = data.user?.id ?? null;
    }
    if (!uid) return fallback;

    // Plan dans profiles
    const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", uid)
        .single();

    const plan = (profile?.plan as Plan) ?? "free";

    // Compte des entrées "possédées"
    const table = kind === "personas" ? "personas" : "worlds";
    const ownerColumn = kind === "personas" ? "user_id" : "owner_id";
    let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(ownerColumn, uid)
        .is("deleted_at", null);
    // Les fiches modèles des mondes (is_template) ne comptent pas
    if (kind === "personas") query = query.eq("is_template", false);
    const { count } = await query;

    const owned = typeof count === "number" ? count : 0;
    const quotaLimit = limitFor(plan, kind);

    return {
        plan,
        owned,
        quotaLimit,
        quotaReached: reached(owned, quotaLimit),
    };
}

/** Helper serveur (RSC / route / action serveur) */
export async function getUserQuotaServer(
    kind: Resource = "worlds"
): Promise<Quota> {
    // Import dynamiques pour éviter de tirer next/headers côté client
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    return getUserQuotaWithClient(supabase, undefined, kind);
}

/** Helper client (components "use client") */
export async function getUserQuotaClient(
    kind: Resource = "worlds"
): Promise<Quota> {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    return getUserQuotaWithClient(supabase, undefined, kind);
}
