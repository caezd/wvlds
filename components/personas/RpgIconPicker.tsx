"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 120;

type Props = {
  value: string | undefined;
  onChange: (icon: string | undefined) => void;
  trigger: React.ReactNode;
};

export function RpgIconPicker({ value, onChange, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [allIcons, setAllIcons] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || allIcons.length > 0) return;
    fetch("/api/rpg-icons")
      .then((r) => r.json())
      .then((list: string[]) => setAllIcons(list))
      .catch(() => {});
  }, [open, allIcons.length]);

  useEffect(() => { setPage(0); }, [search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allIcons;
    const q = search.toLowerCase().replace(/[-_\s]+/g, "");
    return allIcons.filter((f) =>
      f.replace(".svg", "").replace(/[-_]+/g, "").includes(q),
    );
  }, [allIcons, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSelect(icon: string) {
    onChange(icon);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(undefined);
  }

  return (
    <>
      <span onClick={() => setOpen(true)} style={{ display: "contents" }}>
        {trigger}
      </span>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setSearch(""); setPage(0); } }}>
        <DialogContent
          className="max-w-[380px] p-4 gap-3 flex flex-col"
          onOpenAutoFocus={(e) => { e.preventDefault(); searchRef.current?.focus(); }}
        >
          <DialogTitle className="text-sm font-medium leading-none">
            Choisir une icône
          </DialogTitle>

          <div className="flex items-center gap-2">
            <Input
              ref={searchRef}
              placeholder="Rechercher une icône…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                title="Retirer l'icône"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {allIcons.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chargement…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Aucun résultat.</p>
          ) : (
            <>
              <div className="grid grid-cols-8 gap-1 max-h-[280px] overflow-y-auto">
                {visible.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon.replace(".svg", "")}
                    onClick={() => handleSelect(icon)}
                    className={cn(
                      "h-9 w-9 flex items-center justify-center rounded-md border transition-colors",
                      value === icon
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-muted",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/rpg_icons/${icon}`}
                      alt=""
                      className="h-6 w-6 object-contain dark:invert"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-2 py-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    ← Préc.
                  </button>
                  <span>{page + 1} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-2 py-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    Suiv. →
                  </button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
