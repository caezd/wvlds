// components/worlds/WorldsSidebarClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useEffect, useRef, useState, useTransition } from "react";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { toast } from "sonner";
import { usePathname, useRouter } from "next/navigation"; // ✅ usePathname
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Loader2,
  Users,
  ShoppingBasket,
  ShieldCheck,
  ChevronUp,
  Star,
  MessageSquare,
  MoreVertical,
  Settings,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client"; // ajuste ce chemin
import { cn } from "@/lib/utils"; // si tu as déjà ce helper shadcn

import { useNotifications } from "@/components/providers/NotificationsProvider";

type Role = "owner" | "admin" | "editor" | "player" | "viewer";

type WorldRow = {
  id: string;
  name: string;
  slug: string | null;
  is_archived: boolean;
  owner_id: string;
  icon_url?: string | null;
  banner_url?: string | null;
  world_members: { user_id: string; role: Role }[];
};

type FavoriteRoom = {
  id: string;
  name: string | null;
  title: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

type FavoriteWorldRow = WorldRow & { chatrooms: FavoriteRoom[] };

function compactTime(iso: string | null): string {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "< 1min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

function isActivePrefix(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

function getFirstIdAfter(prefix: string, pathname: string) {
  // prefix ex: "/w/" or "/c/"
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const id = rest.split("/")[0];
  return id || null;
}

export default function WorldsSidebarClient(props: {
  meId: string;
  plan: "free" | "pro" | "team" | "lifetime";
  ownedCount: number;
  quotaLimit: number;
  quotaReached: boolean;
  mine: WorldRow[];
  shared: WorldRow[];
  favorites?: FavoriteWorldRow[];
  unreadMap?: Record<string, number>;
  isAdmin?: boolean;
}) {
  const { meId, plan, ownedCount, quotaLimit, quotaReached, mine, shared, favorites = [], isAdmin } =
    props;

  const [q] = useState("");
  const filteredMine = useFilter(mine, q);
  const filteredShared = useFilter(shared, q);

  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { worldUnread } = useNotifications();

  // Pour savoir si le retrait concerne le monde actuellement affiché
  const activeWorldRef = useRef<string | null>(null);

  // Realtime : la liste des mondes suit les invitations/retraits me concernant.
  // Double mécanisme : Broadcast sur mon canal personnel (fiable, émis par le
  // dialog d'invitation) + postgres_changes en filet de sécurité.
  useEffect(() => {
    if (!meId) return;
    const supabase = createClient();
    let broadcastCh: ReturnType<typeof supabase.channel> | null = null;
    let dbCh: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Canal Broadcast dédié — indépendant des postgres_changes : si l'un
    // échoue, l'autre continue de fonctionner.
    const broadcastTopic = `user-events:${meId}`;
    const existingBroadcast = supabase.getChannels().find((ch: { topic: string }) => ch.topic === `realtime:${broadcastTopic}`);
    if (existingBroadcast) void supabase.removeChannel(existingBroadcast);

    broadcastCh = supabase
      .channel(broadcastTopic)
      .on("broadcast", { event: "world_membership" }, (msg: { payload: Record<string, unknown> }) => {
        const p = msg.payload as {
          action?: "added" | "removed";
          world_id?: string;
        } | null;
        router.refresh();
        if (
          p?.action === "removed" &&
          p.world_id &&
          p.world_id === activeWorldRef.current
        ) {
          toast.info("Tu as été retiré de ce monde.");
          router.replace("/home");
        }
      })
      .subscribe((status: string, err?: Error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[user-events] realtime broadcast:", status, err);
        }
      });

    (async () => {
      // La socket realtime doit porter le JWT de session, sinon les INSERT
      // (filtrés par RLS) sont évalués comme anonyme et jamais délivrés.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      // Retirer tout canal existant avec le même topic avant de re-souscrire
      // (React Strict Mode déclenche deux setup successifs rapides).
      const topic = `sidebar-membership-db:${meId}`;
      const existing = supabase.getChannels().find((ch: { topic: string }) => ch.topic === `realtime:${topic}`);
      if (existing) await supabase.removeChannel(existing);
      if (cancelled) return;

      dbCh = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "world_members",
            filter: `user_id=eq.${meId}`,
          },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          // DELETE : seul le PK est transmis, pas de filtre possible -> check client
          { event: "DELETE", schema: "public", table: "world_members" },
          (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
            const old = payload.old as { user_id?: string } | null;
            if (old?.user_id === meId) router.refresh();
          },
        )
        .subscribe((status: string, err?: Error) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[sidebar-membership] postgres_changes:", status, err);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (broadcastCh) void supabase.removeChannel(broadcastCh);
      if (dbCh) void supabase.removeChannel(dbCh);
    };
  }, [meId, router]);

  // worldId actif selon la page courante (pour highlight visuel uniquement)
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);

  useEffect(() => {
    activeWorldRef.current = activeWorldId;
  }, [activeWorldId]);

  useEffect(() => {
    const wId = getFirstIdAfter("/w/", pathname);
    if (wId) { setActiveWorldId(wId); return; }

    const cId = getFirstIdAfter("/c/", pathname);
    if (!cId) { setActiveWorldId(null); return; }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("chatrooms")
        .select("world_id")
        .eq("id", cId)
        .single();
      if (cancelled) return;
      setActiveWorldId(!error && data?.world_id ? data.world_id : null);
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  const { shop } = useFeatureFlags();
  const pActive = isActivePrefix(pathname, "/p");
  const shopActive = isActivePrefix(pathname, "/shop");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Navigation principale — fixe */}
      <div className="shrink-0 px-2 py-3">
        <div className="space-y-1">
          <Link
            href="/p"
            className="group flex items-center justify-between rounded-lg"
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start rounded-full border border-transparent hover:border-[#333333] hover:bg-transparent",
                pActive && "border border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)] hover:bg-[#1a1a1a]"
              )}
            >
              <Users className="h-4 w-4 opacity-80 mr-1" />
              <div className="truncate">Personas</div>
            </Button>
          </Link>

          {shop && (
            <Link
              href="/shop"
              className="group flex items-center justify-between rounded-lg"
            >
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start rounded-full border border-transparent hover:border-[#333333] hover:bg-transparent",
                  shopActive && "border border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)] hover:bg-[#1a1a1a]"
                )}
              >
                <ShoppingBasket className="h-4 w-4 opacity-80 mr-1" />
                <div className="truncate">Boutique</div>
              </Button>
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className="group flex items-center justify-between rounded-lg"
            >
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start rounded-full border border-transparent hover:border-[#333333] hover:bg-transparent",
                  isActivePrefix(pathname, "/admin") && "border border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)] hover:bg-[#1a1a1a]"
                )}
              >
                <ShieldCheck className="h-4 w-4 opacity-80 mr-1" />
                <div className="truncate">Administration</div>
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Separator className="shrink-0" />

      {/* Seule la liste des mondes scrolle */}
      <ScrollArea className="min-h-0 flex-1">
        {favorites.length > 0 && (
          <Section title="Mondes favoris" empty="">
            {favorites.map((w) => (
              <FavoriteWorldItem
                key={w.id}
                meId={meId}
                world={w}
                active={activeWorldId === w.id}
                unread={worldUnread[w.id] ?? 0}
              />
            ))}
          </Section>
        )}

        {(() => {
          const favoriteIds = new Set(favorites.map((f) => f.id));
          const mineNonFav = filteredMine.filter((w) => !favoriteIds.has(w.id));
          const sharedNonFav = filteredShared.filter((w) => !favoriteIds.has(w.id));
          return (
            <>
              {mineNonFav.length > 0 && (
                <Section title="Mes mondes" empty="">
                  {mineNonFav.map((w) => (
                    <WorldItem
                      key={w.id}
                      meId={meId}
                      world={w}
                      active={activeWorldId === w.id}
                      unread={worldUnread[w.id] ?? 0}
                      onActivate={() => { }}
                    />
                  ))}
                </Section>
              )}
              {sharedNonFav.length > 0 && (
                <Section title="Mondes partagés" empty="">
                  {sharedNonFav.map((w) => (
                    <WorldItem
                      key={w.id}
                      meId={meId}
                      world={w}
                      active={activeWorldId === w.id}
                      unread={worldUnread[w.id] ?? 0}
                      onActivate={() => { }}
                    />
                  ))}
                </Section>
              )}
            </>
          );
        })()}
      </ScrollArea>

      {/* Bouton de création — fixe, en bas juste au-dessus du footer */}
      <div className="shrink-0 px-2 py-2">
        <CreateWorldDialog
          disabled={quotaReached}
          plan={plan}
          hint="..."
          ownedCount={ownedCount}
          quotaLimit={quotaLimit}
        />
      </div>
    </div>
  );
}

function useFilter(rows: WorldRow[], q: string) {
  return useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(qq));
  }, [rows, q]);
}

function Section({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const has = Array.isArray(children) ? (children as unknown[]).length > 0 : true;
  return (
    <div className="px-2 py-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="w-full px-2 mb-2 flex items-center justify-between gap-2 text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon && icon}
          <span>{title}</span>
        </span>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && (
        <div className="space-y-1">{has ? children : <Empty text={empty} />}</div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function WorldIcon({ world, size = 6 }: { world: WorldRow; size?: number }) {
  const thumb = world.icon_url ?? world.banner_url ?? null;
  const cls = `h-${size} w-${size} shrink-0`;
  if (thumb) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumb} alt="" className={cn(cls, "rounded-md object-cover")} />
    );
  }
  return (
    <span
      className={cn(
        cls,
        "inline-flex items-center justify-center rounded-md bg-muted text-[11px] font-bold uppercase text-muted-foreground",
      )}
    >
      {world.name.charAt(0)}
    </span>
  );
}

function WorldItem({
  world,
  meId,
  active,
  unread = 0,
  onActivate,
}: {
  world: WorldRow;
  meId: string;
  active?: boolean;
  unread?: number;
  onActivate: () => void;
}) {
  const router = useRouter();
  const isAdmin =
    world.owner_id === meId ||
    world.world_members?.some(
      (m) => m.user_id === meId && ["owner", "admin"].includes(m.role),
    );
  const isSharedMember = world.world_members?.some(
    (m) => m.user_id === meId && m.role !== "owner",
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-xl border border-transparent pr-1 transition-colors hover:border-[#333333]",
        active &&
        "border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)]",
      )}
    >
      <Link
        href={`/w/${world.id}`}
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
      >
        <div className="relative shrink-0">
          <WorldIcon world={world} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_2px_black]" />
          )}
        </div>
        <span className="truncate">{world.name}</span>
      </Link>

      {/* Actions au survol */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Nouveau salon"
          onClick={() => router.push(`/w/${world.id}`)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#2a2a2a] hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#2a2a2a] hover:text-foreground"
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="z-[200] min-w-40">
            {isAdmin && (
              <DropdownMenuItem
                onClick={() => router.push(`/w/${world.id}`)}
                className="gap-2"
              >
                <Settings className="h-3.5 w-3.5" />
                Paramètres
              </DropdownMenuItem>
            )}
            {isAdmin && isSharedMember && <DropdownMenuSeparator />}
            {isSharedMember && (
              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
                Quitter le monde
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FavoriteWorldItem({
  world,
  meId,
  active,
  unread = 0,
}: {
  world: FavoriteWorldRow;
  meId: string;
  active?: boolean;
  unread?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin =
    world.owner_id === meId ||
    world.world_members?.some(
      (m) => m.user_id === meId && ["owner", "admin"].includes(m.role),
    );
  const isSharedMember = world.world_members?.some(
    (m) => m.user_id === meId && m.role !== "owner",
  );

  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-xl border border-transparent pr-1 transition-colors hover:border-[#333333]",
          active &&
          "border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)]",
        )}
      >
        <Link
          href={`/w/${world.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
        >
          <div className="relative shrink-0">
            <WorldIcon world={world} size={6} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_2px_black]" />
            )}
          </div>
          <span className="truncate">{world.name}</span>
        </Link>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Nouveau salon"
            onClick={() => router.push(`/w/${world.id}`)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#2a2a2a] hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#2a2a2a] hover:text-foreground"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="z-[200] min-w-40">
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => router.push(`/w/${world.id}`)}
                  className="gap-2"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Paramètres
                </DropdownMenuItem>
              )}
              {isAdmin && isSharedMember && <DropdownMenuSeparator />}
              {isSharedMember && (
                <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-3.5 w-3.5" />
                  Quitter le monde
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {world.chatrooms.length > 0 && (
        <div className="ml-5 space-y-0.5 border-l border-border-soft pl-2">
          {world.chatrooms.map((room) => {
            const isActiveRoom = pathname?.startsWith(`/c/${room.id}`);
            return (
              <Link key={room.id} href={`/c/${room.id}`}>
                <div className="relative flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  {isActiveRoom && (
                    <span className="absolute -left-[11px] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-border-soft" />
                  )}
                  {room.has_unread && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {room.title ?? room.name ?? "Sans titre"}
                  </span>
                  {room.last_message_at && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/50">
                      {compactTime(room.last_message_at)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CreateWorldDialog({
  disabled,
  plan,
  hint,
  ownedCount,
  quotaLimit,
  trigger,
}: {
  disabled?: boolean;
  plan: "free" | "pro" | "team" | "lifetime";
  hint: string;
  ownedCount: number;
  quotaLimit: number;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleCreate(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!name) return;

    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("worlds")
        .insert({ owner_id: user.id, name, description })
        .select("id")
        .single();

      if (!error && data?.id) {
        setOpen(false);
        router.push(`/w/${data.id}`);
      } else {
        // Option: toaster d’erreur
        console.error(error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            title={hint}
            className="w-full justify-between rounded-full border border-[#333333] bg-[#1a1a1a] font-semibold text-foreground shadow-[0_1px_2px_0_rgba(128,128,128,0.1)] hover:bg-[#1a1a1a]"
          >
            <span className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Nouveau monde
            </span>
            {quotaLimit !== Infinity && (
              <span className="text-xs font-normal text-muted-foreground">
                {ownedCount}/{quotaLimit}
              </span>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau monde</DialogTitle>
        </DialogHeader>

        {plan === "free" && disabled ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            Ton quota gratuit est atteint. Passe à un plan supérieur pour créer
            plus de mondes.
          </div>
        ) : (
          <form
            action={handleCreate}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              handleCreate(fd);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nom du monde</Label>
              <Input
                id="name"
                name="name"
                placeholder="Ex. Avalonia"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="Optionnel"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

