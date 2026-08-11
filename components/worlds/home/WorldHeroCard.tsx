"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Globe, GlobeLock } from "lucide-react";

import { type World } from "@/types/worlds";
import { supabaseThumb } from "@/lib/storage";

type HeroWorld = World & { owner_id: string };

/**
 * Carte hero du monde (kit "Constructor X") : bannière, icône, nom,
 * description. Intègre le bouton d'invitation et, pour les admins,
 * un crayon au survol qui ouvre le modal d'édition.
 */
export function WorldHeroCard({
  world: initialWorld,
  canAdmin: _canAdmin = false,
  footer,
  isExpanded = false,
}: {
  world: HeroWorld;
  canAdmin?: boolean;
  /** Contenu rendu tout en bas de la bannière (ex: barre d'onglets). */
  footer?: ReactNode;
  isExpanded?: boolean;
}) {
  const [world, _setWorld] = useState(initialWorld);
  const [bannerThumbFailed, setBannerThumbFailed] = useState(false);

  useEffect(() => {
    setBannerThumbFailed(false);
  }, [world.banner_url]);

  return (
    <section
      className={[
        "group/hero relative overflow-hidden p-6 md:p-8",
        isExpanded ? "" : "rounded-3xl",
      ].join(" ")}
      style={{
        // Pas de couleur de fond derrière une bannière image : elle dépasse
        // dans les coins arrondis sous l'image.
        backgroundColor: world.banner_url
          ? undefined
          : (world.color ?? undefined),
      }}
    >
      {world.banner_url && (
        <Image
          src={bannerThumbFailed ? world.banner_url : (supabaseThumb(world.banner_url, 1200) ?? world.banner_url)}
          onError={() => setBannerThumbFailed(true)}
          alt=""
          fill
          sizes="(min-width: 1024px) 800px, 100vw"
          className="rounded-[inherit] object-cover"
          priority
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

      <div className="relative z-10 flex min-h-40 flex-col justify-end gap-2 md:min-h-48">
        <span
          className={
            world.icon_url
              ? "relative mb-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full"
              : "relative mb-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-black/50"
          }
        >
          {world.icon_url ? (
            <Image
              src={world.icon_url}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
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
