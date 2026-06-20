"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, GlobeLock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { supabaseThumb } from "@/lib/storage";

type WorldPreview = {
    name: string;
    description: string | null;
    icon_url: string | null;
    banner_url: string | null;
    color: string | null;
    visibility: string | null;
};

export function WorldPreviewDialog({
    worldId,
    open,
    onOpenChange,
    fallbackName,
    prefetchedData,
}: {
    worldId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fallbackName?: string | null;
    prefetchedData?: Omit<WorldPreview, "color" | "visibility"> | null;
}) {
    const supabase = useMemo(() => createClient(), []);
    const [world, setWorld] = useState<WorldPreview | null>(null);

    useEffect(() => {
        if (!open) return;
        if (prefetchedData) {
            setWorld({ color: null, visibility: null, ...prefetchedData });
            return;
        }
        if (!worldId) return;
        setWorld(null);
        supabase
            .from("worlds")
            .select("name, description, icon_url, banner_url, color, visibility")
            .eq("id", worldId)
            .maybeSingle()
            .then(({ data }: { data: WorldPreview | null }) => setWorld(data));
    }, [worldId, open, prefetchedData, supabase]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden max-w-sm gap-0 border-border-soft">
                <DialogTitle className="sr-only">{world?.name ?? "Aperçu du monde"}</DialogTitle>

                {/* Hero */}
                <div
                    className="relative isolate overflow-hidden p-6"
                    style={{
                        backgroundColor: world?.banner_url ? undefined : (world?.color ?? undefined),
                        minHeight: 200,
                    }}
                >
                    {world?.banner_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={supabaseThumb(world.banner_url, 600) ?? world.banner_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    )}
                    <div
                        className={
                            world?.banner_url
                                ? "absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent"
                                : world?.color
                                    ? "absolute inset-0 bg-black/20"
                                    : "absolute inset-0 bg-gradient-to-br from-card to-card-400"
                        }
                    />
                    <div className="relative flex min-h-32 flex-col justify-end gap-2">
                        <span className={[
                            "mb-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full",
                            !world?.icon_url ? "bg-black/40 backdrop-blur" : "",
                        ].join(" ")}>
                            {world?.icon_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={world.icon_url} alt="" className="h-full w-full object-cover" />
                            ) : world?.visibility === "public" ? (
                                <Globe size={18} className="text-white/90" />
                            ) : (
                                <GlobeLock size={18} className="text-white/90" />
                            )}
                        </span>
                        <h2 className="text-xl font-semibold text-white">
                            {world?.name ?? fallbackName ?? <span className="opacity-40">…</span>}
                        </h2>
                        {world?.description && (
                            <p className="text-sm text-white/75 max-w-xs">{world.description}</p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
