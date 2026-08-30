"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative flex size-8 shrink-0 overflow-hidden", className)}
      {...props}
    />
  );
}

/**
 * Image d'avatar.
 *
 * `alt=""` par défaut, et c'est délibéré : un avatar est ici toujours accolé
 * au nom qu'il illustre — celui d'un salon, d'un membre, d'un auteur de
 * message. Le décrire une seconde fois ferait entendre deux fois la même
 * chose à un lecteur d'écran ; une chaîne vide le marque décoratif, ce qui
 * est la bonne réponse.
 *
 * Sans `alt` du tout, en revanche, l'image devient une violation : elle est
 * annoncée par son URL. Huit appels l'omettaient, et l'analyse d'accessibilité
 * ne les a signalés que le jour où de nouveaux messages ont fait apparaître un
 * avatar sur la page mesurée — d'où ce repli, qui ne dépend d'aucun appelant.
 *
 * Un appelant qui a besoin d'un vrai texte alternatif passe simplement `alt`.
 */
function AvatarImage({
  className,
  alt = "",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      alt={alt}
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-black/35 flex size-full items-center justify-center",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
