/**
 * Squelette de la sidebar de monde (desktop), affiché pendant que
 * `WorldSidebar` charge ses données — la sidebar n'est plus attendue avant
 * d'envoyer le reste de la page : elle arrive en streaming juste après.
 *
 * Mêmes dimensions que l'`<aside>` réel (largeur, bordure) pour que rien ne
 * bouge quand il prend la place du squelette. Rien côté mobile : le tiroir
 * global reste fermé tant qu'on ne l'ouvre pas, et `MobileSidebarSlot` y
 * injecte la nav dès qu'elle est prête.
 */
export function WorldSidebarSkeleton() {
  return (
    <aside
      aria-hidden="true"
      data-testid="world-sidebar-skeleton"
      className="hidden lg:flex w-60 shrink-0 flex-col overflow-hidden border-r border-border"
    >
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <div className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-2 border-b px-3 py-3">
        {[20, 24, 18, 22].map((w) => (
          <div key={w} className="h-3.5 animate-pulse rounded bg-muted" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="flex flex-col gap-3 px-3 py-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="size-6 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </aside>
  );
}
