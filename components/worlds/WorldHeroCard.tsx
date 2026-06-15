"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Globe, GlobeLock } from "lucide-react";

import { type World } from "@/components/worlds/WorldEditDialog";
import { supabaseThumb } from "@/lib/storage";
import { useNotifications } from "@/components/providers/NotificationsProvider";

type HeroWorld = World & { owner_id: string };

/**
 * Carte hero du monde (kit "Constructor X") : bannière, icône, nom,
 * description. Intègre le bouton d'invitation et, pour les admins,
 * un crayon au survol qui ouvre le modal d'édition.
 */
export function WorldHeroCard({
  world: initialWorld,
  canAdmin = false,
  footer,
}: {
  world: HeroWorld;
  canAdmin?: boolean;
  /** Contenu rendu tout en bas de la bannière (ex: barre d'onglets). */
  footer?: ReactNode;
}) {
  const [world, setWorld] = useState(initialWorld);
  const { markWorldSeen } = useNotifications();

  useEffect(() => {
    void markWorldSeen(world.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

  return (
    <section
      className="group/hero relative isolate overflow-hidden rounded-3xl p-6 md:p-8"
      style={{
        // Pas de couleur de fond derrière une bannière image : elle dépasse
        // dans les coins arrondis sous l'image.
        backgroundColor: world.banner_url
          ? undefined
          : (world.color ?? undefined),
      }}
    >
      {world.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={supabaseThumb(world.banner_url, 1200) ?? world.banner_url}
          onError={(e) => { e.currentTarget.src = world.banner_url!; e.currentTarget.onerror = null; }}
          alt=""
          className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
        />
      )}
      {/* Voile de lisibilité / fallback sans bannière */}
      <div
        className={
          world.banner_url
            ? "absolute inset-0 rounded-[inherit] bg-gradient-to-r from-black/70 via-black/40 to-transparent"
            : world.color
              ? "absolute inset-0 rounded-[inherit] bg-black/20"
              : "absolute inset-0 rounded-[inherit] bg-gradient-to-br from-card-400 to-card"
        }
      />

<div className="relative flex min-h-40 flex-col justify-end gap-2 md:min-h-48">
        <span
          className={
            world.icon_url
              ? "mb-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full"
              : "mb-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-black/40 backdrop-blur"
          }
        >
          {world.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={world.icon_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : world.visibility === "public" ? (
            <Globe size={20} className="text-white/90" />
          ) : (
            <GlobeLock size={20} className="text-white/90" />
          )}
        </span>
        <h1 className="text-2xl font-semibold text-white md:text-3xl">
          {world.name}
        </h1>
        {world.description && (
          <p className="max-w-xl text-sm text-white/75">{world.description}</p>
        )}
      </div>

      {footer && <div className="relative mt-6">{footer}</div>}
    </section>
  );
}
