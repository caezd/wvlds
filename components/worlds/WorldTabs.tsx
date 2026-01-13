"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WorldAddTabDialog } from "./WorldAddTabDialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
    MoreHorizontal,
    ArrowLeft,
    ArrowRight,
    Pencil,
    Trash2,
    Plus,
} from "lucide-react";

type TabRow = {
    id: string;
    world_id: string;
    slug: string;
    label: string;
    sort_index: number;
    is_system: boolean;
};

type WorldTabsProps = {
    worldId: string;
    /** Si vrai, affiche les contrôles (ajout/rename/suppr/réorder) */
    canEdit?: boolean;
    /** Valeur sélectionnée initiale (slug). Si absent, on prend le 1er par sort_index. */
    value?: string;
    /** Notifie l’extérieur lors d’un changement d’onglet */
    onChange?: (slug: string) => void;
    /** Permet de rendre du contenu selon l’onglet actif (facultatif) */
    renderTab?: (tab: TabRow, active: boolean) => React.ReactNode;
};

export function WorldTabs({
    worldId,
    canEdit = false,
    value,
    onChange,
    renderTab,
}: WorldTabsProps) {
    const supabase = createClient();
    const [tabs, setTabs] = React.useState<TabRow[] | null>(null);
    const [current, setCurrent] = React.useState<string | undefined>(value);
    const [renamingId, setRenamingId] = React.useState<string | null>(null);
    const [renameValue, setRenameValue] = React.useState<string>("");

    // Load tabs
    async function load() {
        const { data, error } = await supabase
            .from("world_content_tabs")
            .select("*")
            .eq("world_id", worldId)
            .order("sort_index", { ascending: true });

        if (error) {
            toast.error(error.message);
            return;
        }
        setTabs(data);
        // sélection par défaut
        if (!current) {
            const preferred =
                data.find((t) => t.slug === "contexte") ?? data[0];
            setCurrent(preferred?.slug);
            onChange?.(preferred?.slug ?? "");
        }
    }

    React.useEffect(() => {
        load(); /* eslint-disable react-hooks/exhaustive-deps */
    }, [worldId]);

    // Realtime
    React.useEffect(() => {
        const channel = supabase
            .channel(`world_tabs:${worldId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "world_content_tabs",
                    filter: `world_id=eq.${worldId}`,
                },
                () => load()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, worldId]);

    // External value change sync
    React.useEffect(() => {
        if (value) setCurrent(value);
    }, [value]);

    function selectTab(slug: string) {
        setCurrent(slug);
        onChange?.(slug);
    }

    // Helpers: reorder
    async function swapOrder(a: TabRow, b: TabRow) {
        if (!a || !b) return;
        const updates = [
            { id: a.id, sort_index: b.sort_index },
            { id: b.id, sort_index: a.sort_index },
        ];
        const { error } = await supabase
            .from("world_content_tabs")
            .upsert(updates);
        if (error) toast.error(error.message);
    }

    async function moveLeft(tab: TabRow) {
        if (!tabs) return;
        const idx = tabs.findIndex((t) => t.id === tab.id);
        if (idx <= 0) return;
        await swapOrder(tabs[idx], tabs[idx - 1]);
    }

    async function moveRight(tab: TabRow) {
        if (!tabs) return;
        const idx = tabs.findIndex((t) => t.id === tab.id);
        if (idx === -1 || idx >= tabs.length - 1) return;
        await swapOrder(tabs[idx], tabs[idx + 1]);
    }

    // Rename
    async function startRename(tab: TabRow) {
        setRenamingId(tab.id);
        setRenameValue(tab.label);
    }

    async function confirmRename(tab: TabRow) {
        const label = renameValue.trim();
        if (!label) {
            toast.error("Le nom est requis.");
            return;
        }
        const { error } = await supabase
            .from("world_content_tabs")
            .update({ label })
            .eq("id", tab.id);
        if (error) toast.error(error.message);
        setRenamingId(null);
    }

    // Delete
    async function deleteTab(tab: TabRow) {
        if (tab.is_system) {
            toast.error("Cet onglet système ne peut pas être supprimé.");
            return;
        }
        const { error } = await supabase
            .from("world_content_tabs")
            .delete()
            .eq("id", tab.id);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Onglet supprimé.");
        // Ajuster sélection si on supprime l’actif
        if (current === tab.slug && tabs) {
            const remaining = tabs
                .filter((t) => t.id !== tab.id)
                .sort((a, b) => a.sort_index - b.sort_index);
            const next = remaining[0];
            if (next) selectTab(next.slug);
        }
    }

    const nextIndex = tabs?.length ?? 0;

    return (
        <div className="space-y-3">
            <Tabs value={current} onValueChange={selectTab}>
                <div className="flex items-center justify-between">
                    <TabsList className="flex flex-wrap">
                        {tabs?.map((tab, i) => {
                            const isRenaming = renamingId === tab.id;
                            return (
                                <div
                                    key={tab.id}
                                    className="flex items-center mr-1"
                                >
                                    <TabsTrigger
                                        value={tab.slug}
                                        className="px-3"
                                    >
                                        {isRenaming ? (
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={renameValue}
                                                    onChange={(e) =>
                                                        setRenameValue(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="h-7 w-[140px]"
                                                />
                                                <Button
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() =>
                                                        confirmRename(tab)
                                                    }
                                                >
                                                    ✓
                                                </Button>
                                            </div>
                                        ) : (
                                            <span>{tab.label}</span>
                                        )}
                                    </TabsTrigger>

                                    {canEdit && !isRenaming && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 -ml-2"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="start"
                                                className="w-44"
                                            >
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        moveLeft(tab)
                                                    }
                                                    disabled={i === 0}
                                                >
                                                    <ArrowLeft className="h-4 w-4 mr-2" />{" "}
                                                    Déplacer à gauche
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        moveRight(tab)
                                                    }
                                                    disabled={
                                                        i === tabs.length - 1
                                                    }
                                                >
                                                    <ArrowRight className="h-4 w-4 mr-2" />{" "}
                                                    Déplacer à droite
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        startRename(tab)
                                                    }
                                                >
                                                    <Pencil className="h-4 w-4 mr-2" />{" "}
                                                    Renommer
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        deleteTab(tab)
                                                    }
                                                    disabled={tab.is_system}
                                                    className={
                                                        tab.is_system
                                                            ? "opacity-50"
                                                            : "text-red-600"
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />{" "}
                                                    Supprimer
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            );
                        })}
                    </TabsList>

                    {/* Bouton d’ajout en doublon ici si tu veux aussi à droite des onglets */}
                    {canEdit && (
                        <WorldAddTabDialog
                            worldId={worldId}
                            nextIndex={nextIndex}
                            onCreated={(t) => {
                                // 1) on injecte tout de suite le nouvel onglet dans l'état
                                setTabs((prev) => {
                                    const next = prev ? [...prev, t] : [t];
                                    next.sort(
                                        (a, b) => a.sort_index - b.sort_index
                                    );
                                    return next;
                                });
                                // 2) on le sélectionne pour l'afficher immédiatement
                                selectTab(t.slug);
                            }}
                        />
                    )}
                </div>

                {/* Contenu: si renderTab n'est pas fourni, on montre un placeholder */}
                {(tabs ?? []).map((tab) => (
                    <TabsContent key={tab.id} value={tab.slug} className="pt-4">
                        {renderTab ? (
                            renderTab(tab, current === tab.slug)
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Contenu pour <b>{tab.label}</b> — branche ici
                                ton éditeur Markdown/WYSIWYG.
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
