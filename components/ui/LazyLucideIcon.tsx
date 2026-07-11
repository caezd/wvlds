"use client";

import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Charge `lucide-react` en un seul chunk, une seule fois (promesse mise en
 * cache au niveau module), au lieu du chunk par icône de `lucide-react/dynamic`
 * — ce dernier fait exploser le nombre de modules compilés par Turbopack en
 * dev (un par icône de la librairie, ~1800), rendant le serveur de dev
 * inutilisable. Voir https://github.com/lucide-icons/lucide/issues/1576.
 */
let lucideModulePromise: Promise<Record<string, IconComponent>> | null = null;
function loadLucide() {
  if (!lucideModulePromise) {
    lucideModulePromise = import("lucide-react") as unknown as Promise<Record<string, IconComponent>>;
  }
  return lucideModulePromise;
}

function toPascalCase(kebabName: string): string {
  return kebabName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** Remplacement de `DynamicIcon` (lucide-react/dynamic) par nom d'icône kebab-case. */
export function LazyLucideIcon({
  name,
  ...props
}: { name: string } & SVGProps<SVGSVGElement>) {
  const [Icon, setIcon] = useState<IconComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLucide().then((mod) => {
      if (cancelled) return;
      setIcon(() => mod[toPascalCase(name)] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!Icon) return null;
  return <Icon {...props} />;
}
