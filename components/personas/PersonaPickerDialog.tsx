"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import type { Persona } from "@/types/db-chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, Star } from "lucide-react";
import { useTranslations } from "next-intl";
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function PersonaRow({
  persona,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
  favoriteLabel,
}: {
  persona: Persona;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  favoriteLabel: string;
}) {
  return (
    <div
      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${selected ? "bg-muted" : "hover:bg-muted/60"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        aria-pressed={selected}
      >
        <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
          {persona.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={supabaseThumb(persona.avatar_url, 72) ?? persona.avatar_url}
              onError={(e) => { e.currentTarget.src = persona.avatar_url!; e.currentTarget.onerror = null; }}
              alt={persona.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-xs font-bold text-muted-foreground">
              {initials(persona.name)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{persona.name}</span>
        {selected && (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favoriteLabel}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-yellow-500 focus-visible:outline-none"
      >
        <Star size={18} className={favorite ? "fill-yellow-400 text-yellow-500" : ""} />
      </button>
    </div>
  );
}

export function PersonaPickerDialog({
  selected,
  onSelect,
  trigger,
  required = true,
  userId,
  worldId,
}: {
  selected: Persona | null;
  onSelect: (persona: Persona | null) => void;
  trigger?: React.ReactNode;
  required?: boolean;
  userId?: string | null;
  worldId?: string | null;
}) {
  const t = useTranslations("personas");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [value, setValue] = useState<string>(selected?.id ?? "");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId ?? null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => setValue(selected?.id ?? ""), [selected?.id, open]);

  const favoritesKey = resolvedUserId ? `persona-favorites:${resolvedUserId}` : null;

  // Charge les favoris (localStorage, propre à l'utilisateur) dès qu'on connaît son id.
  useEffect(() => {
    if (!favoritesKey) return;
    try {
      const raw = localStorage.getItem(favoritesKey);
      setFavorites(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setFavorites(new Set());
    }
  }, [favoritesKey]);

  function toggleFavorite(personaId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(personaId)) next.delete(personaId);
      else next.add(personaId);
      if (favoritesKey) {
        try { localStorage.setItem(favoritesKey, JSON.stringify([...next])); } catch { }
      }
      return next;
    });
  }

  // Recharge à chaque ouverture pour avoir les avatars à jour
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      let uid = userId ?? null;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id ?? null;
      }
      setResolvedUserId(uid);
      if (!uid) { setLoading(false); return; }
      let query = supabase
        .from("personas")
        .select("id, user_id, name, avatar_url")
        .eq("user_id", uid)
        .eq("is_template", false)
        .order("name", { ascending: true });
      if (worldId) query = query.eq("world_id", worldId);
      const { data } = await query;
      setPersonas(data ?? []);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, worldId, open]);

  const sortedPersonas = useMemo(() => {
    return [...personas].sort((a, b) => {
      const favA = favorites.has(a.id);
      const favB = favorites.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [personas, favorites]);

  const canConfirm = !!value && (!required || !!value);

  function confirm() {
    const chosen = personas.find((p) => p.id === value) ?? null;
    onSelect(chosen);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="size-9 rounded-full overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selected ? (
              selected.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={supabaseThumb(selected.avatar_url, 72) ?? selected.avatar_url} onError={(e) => { e.currentTarget.src = selected.avatar_url!; e.currentTarget.onerror = null; }} alt={selected.name} className="h-full w-full object-cover" />
              ) : (
                <span className="h-full w-full grid place-items-center text-xs font-bold bg-muted text-muted-foreground">
                  {initials(selected.name)}
                </span>
              )
            ) : (
              <span className="h-full w-full grid place-items-center bg-muted text-muted-foreground">
                <Plus size={16} />
              </span>
            )}
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("pick")}</DialogTitle>
          <DialogDescription className="sr-only">{t("pick")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : personas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("pickerEmpty")}
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-1 pr-3 pb-1">
              {sortedPersonas.map((p) => (
                <PersonaRow
                  key={p.id}
                  persona={p}
                  selected={value === p.id}
                  favorite={favorites.has(p.id)}
                  onSelect={() => setValue(p.id)}
                  onToggleFavorite={() => toggleFavorite(p.id)}
                  favoriteLabel={t("toggleFavorite")}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost">{tCommon("cancel")}</Button>
          </DialogClose>
          <Button disabled={!canConfirm} onClick={confirm}>
            {tCommon("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
