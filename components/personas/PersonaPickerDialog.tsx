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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function PersonaCard({
  persona,
  selected,
  onSelect,
}: {
  persona: Persona;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative w-full aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none"
      aria-pressed={selected}
    >
      {persona.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={supabaseThumb(persona.avatar_url, 200) ?? persona.avatar_url}
          onError={(e) => { e.currentTarget.src = persona.avatar_url!; e.currentTarget.onerror = null; }}
          alt={persona.name}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-2xl font-bold text-muted-foreground select-none">
          {initials(persona.name)}
        </div>
      )}

      {/* Gradient + nom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <span className="text-xs font-semibold text-white leading-tight line-clamp-2 text-left block">
          {persona.name}
        </span>
      </div>

      {/* Indicateur sélectionné */}
      {selected && (
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-white flex items-center justify-center shadow">
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-black fill-current">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
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

  useEffect(() => setValue(selected?.id ?? ""), [selected?.id, open]);

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
      if (!uid) { setLoading(false); return; }
      let query = supabase
        .from("personas")
        .select("id, user_id, name, avatar_url")
        .eq("user_id", uid)
        .order("name", { ascending: true });
      if (worldId) query = query.eq("world_id", worldId);
      const { data } = await query;
      setPersonas(data ?? []);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, worldId, open]);

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
        </DialogHeader>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : personas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("pickerEmpty")}
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-2 gap-3 pr-3 pb-1">
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  selected={value === p.id}
                  onSelect={() => setValue(p.id)}
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
