// components/worlds/WorldsSidebarClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation"; // ✅ usePathname
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Loader2,
  GlobeLock,
  Globe,
  Users,
  ShoppingBasket,
  ShieldCheck,
} from "lucide-react";
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
  world_members: { user_id: string; role: Role }[];
};

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
  mine: any[];
  shared: any[];
  unreadMap?: Record<string, number>;
  isAdmin?: boolean;
}) {
  const { meId, plan, ownedCount, quotaLimit, quotaReached, mine, shared, isAdmin } =
    props;

  const [q, setQ] = useState("");
  const filteredMine = useFilter(mine, q);
  const filteredShared = useFilter(shared, q);

  const pathname = usePathname() ?? "/";
  const { worldUnread } = useNotifications();

  // worldId actif selon la page courante (pour highlight visuel uniquement)
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);

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

  const pActive = isActivePrefix(pathname, "/p");
  const shopActive = isActivePrefix(pathname, "/shop");

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 py-3">
        <div className="space-y-1">
          <Link
            href="/p"
            className="group flex items-center justify-between rounded-lg"
          >
            <Button
              variant={pActive ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
            >
              <Users className="h-4 w-4 opacity-80 mr-1" />
              <div className="truncate">Personae</div>
            </Button>
          </Link>

          <Link
            href="/shop"
            className="group flex items-center justify-between rounded-lg"
          >
            <Button
              variant={shopActive ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
            >
              <ShoppingBasket className="h-4 w-4 opacity-80 mr-1" />
              <div className="truncate">Boutique</div>
            </Button>
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="group flex items-center justify-between rounded-lg"
            >
              <Button
                variant={isActivePrefix(pathname, "/admin") ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start"
              >
                <ShieldCheck className="h-4 w-4 opacity-80 mr-1" />
                <div className="truncate">Administration</div>
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="p-4">
        <Input
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-2 text-xs text-muted-foreground">
          {plan === "free"
            ? `Quota : ${ownedCount}/${quotaLimit}`
            : `Plan : ${plan}`}
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <Section title="Mes mondes" empty="Aucun monde possédé.">
          <CreateWorldDialog disabled={quotaReached} plan={plan} hint="..." />
          {filteredMine.map((w) => (
            <WorldItem
              key={w.id}
              meId={meId}
              world={w}
              // ✅ actif si on est sur /w/:id/... OU sur /c/:chatroomId qui appartient à ce monde
              active={activeWorldId === w.id}
              unread={worldUnread[w.id] ?? 0}
              onActivate={() => {}}
            />
          ))}
        </Section>

        <Section
          title="Partagés avec moi"
          empty="Rien de partagé pour le moment."
        >
          {filteredShared.map((w) => (
            <WorldItem
              key={w.id}
              meId={meId}
              world={w}
              active={activeWorldId === w.id}
              unread={worldUnread[w.id] ?? 0}
              onActivate={() => {}}
            />
          ))}
        </Section>
      </ScrollArea>
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
  const has = Array.isArray(children) ? (children as any[]).length > 0 : true;
  return (
    <div className="px-2 py-3">
      <div className="px-2 mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon && icon}
        <span>{title}</span>
      </div>
      <div className="space-y-1">{has ? children : <Empty text={empty} />}</div>
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
  const members = world.world_members ?? [];
  const isShared = members.some((m) => m.user_id !== world.owner_id); // partagé si quelqu'un d'autre que l’owner est membre

  return (
    <Link
      href={`/w/${world.id}`}
      onClick={onActivate}
      className={cn("group flex items-center justify-between rounded-lg")}
    >
      <Button
        variant={active ? "secondary" : "ghost"}
        size="sm"
        className="w-full justify-start"
      >
        <div className="relative">
          {isShared ? (
            <Globe className="h-4 w-4 opacity-80 mr-1" />
          ) : (
            <GlobeLock className="h-4 w-4 opacity-80 mr-1" />
          )}
          {unread > 0 && (
            <span
              title={`${unread} nouveauté(s)`}
              className={cn(
                `inline-flex h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_2px_black] text-[.65rem] absolute -right-0.5 -top-0.5 items-center justify-center leading-none text-black/80 font-medium`,
              )}
            >
              {/* {unread} */}
            </span>
          )}
        </div>

        <div className="truncate">{world.name}</div>
      </Button>
    </Link>
  );
}

function CreateWorldDialog({
  disabled,
  plan,
  hint,
}: {
  disabled?: boolean;
  plan: "free" | "pro" | "team" | "lifetime";
  hint: string;
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
        <Button
          size="sm"
          disabled={disabled}
          title={hint}
          className="w-full justify-start"
        >
          <Plus className="mr-1 h-4 w-4" />
          Nouveau monde
        </Button>
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

