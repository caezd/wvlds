"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    content?: string | null;
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
    /** Si fourni, ajoute un onglet « Home » (icône) en tête dont le contenu est ce nœud. */
    homeNode?: React.ReactNode;
    /** Reçoit la barre d'onglets et retourne son habillage (ex: bannière). Le
        contenu des onglets est rendu en dessous. */
    heroSlot?: (bar: React.ReactNode) => React.ReactNode;
};

const HOME_SLUG = "__home__";

export function WorldTabs({
    worldId,
    canEdit = false,
    value,
    onChange,
    renderTab,
    homeNode,
    heroSlot,
}: WorldTabsProps) {
    const supabase = createClient();
    const [tabs, setTabs] = React.useState<TabRow[] | null>(null);
    const [current, setCurrent] = React.useState<string | undefined>(
        value ?? (homeNode ? HOME_SLUG : undefined),
    );
    const [renamingId, setRenamingId] = React.useState<string | null>(null);
    const [renameValue, setRenameValue] = React.useState<string>("");
    const [confirmDeleteTab, setConfirmDeleteTab] = React.useState<TabRow | null>(null);

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
        // sélection par défaut (sauf si l'onglet Home tient lieu de défaut)
        if (!current && !homeNode) {
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
        const { error } = await supabase
            .from("world_content_tabs")
            .delete()
            .eq("id", tab.id);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Onglet supprimé.");
        // Mise à jour locale immédiate
        setTabs((prev) => {
            if (!prev) return prev;
            const next = prev.filter((t) => t.id !== tab.id);
            // Ajuster sélection si on supprime l’actif
            if (current === tab.slug) {
                const sorted = [...next].sort((a, b) => a.sort_index - b.sort_index);
                const fallback = homeNode ? HOME_SLUG : sorted[0]?.slug;
                if (fallback) selectTab(fallback);
            }
            return next;
        });
    }

    const nextIndex = tabs?.length ?? 0;

    const addButton = canEdit ? (
        <WorldAddTabDialog
            worldId={worldId}
            nextIndex={nextIndex}
            onCreated={(t) => {
                setTabs((prev) => {
                    const next = prev ? [...prev, t] : [t];
                    next.sort((a, b) => a.sort_index - b.sort_index);
                    return next;
                });
                selectTab(t.slug);
            }}
            trigger={
                <Button size="sm" variant="secondary">
                    <Plus className="mr-2 h-4 w-4" />
                    Onglet
                </Button>
            }
        />
    ) : null;

    // Barre d'onglets « d'entête » : onglets soulignés à l'actif, séparateur
    // horizontal commun en bas, bouton d'ajout ancré à droite.
    const makeBar = (className?: string) => (
        <div
            className={cn(
                "flex items-stretch gap-2 border-b border-border-soft pr-2",
                className,
            )}
        >
            <TabsPrimitive.List className="flex flex-1 items-stretch">
                {tabs?.map((tab, i) => {
                    const isRenaming = renamingId === tab.id;
                    const isActive = current === tab.slug;
                    return (
                        <div
                            key={tab.id}
                            className={cn(
                                "relative flex items-center px-1",
                                "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0",
                                isActive && "after:opacity-100",
                            )}
                        >
                            <TabsPrimitive.Trigger
                                value={tab.slug}
                                className={cn(
                                    "flex items-center justify-center gap-1.5 whitespace-nowrap px-2 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none data-[state=active]:text-foreground",
                                )}
                            >
                                {isRenaming ? (
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    void confirmRename(tab);
                                                }
                                                if (e.key === "Escape") setRenamingId(null);
                                            }}
                                            autoFocus
                                            className="h-6 w-28 rounded-md border-0 bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0 md:text-sm"
                                        />
                                        <Button
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => confirmRename(tab)}
                                            aria-label="Valider le nom"
                                        >
                                            ✓
                                        </Button>
                                    </div>
                                ) : (
                                    <span>{tab.label}</span>
                                )}
                            </TabsPrimitive.Trigger>

                            {canEdit && !isRenaming && isActive && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 -ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Options de l'onglet"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-44">
                                        <DropdownMenuItem onClick={() => moveLeft(tab)} disabled={i === 0}>
                                            <ArrowLeft className="h-4 w-4 mr-2" /> Déplacer à gauche
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => moveRight(tab)} disabled={i === tabs.length - 1}>
                                            <ArrowRight className="h-4 w-4 mr-2" /> Déplacer à droite
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => startRename(tab)}>
                                            <Pencil className="h-4 w-4 mr-2" /> Renommer
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setConfirmDeleteTab(tab)}
                                            className="text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    );
                })}
            </TabsPrimitive.List>
            {addButton && <div className="flex shrink-0 items-center">{addButton}</div>}
        </div>
    );
    const bar = makeBar();

    // Aucun onglet et pas le droit d'en créer : rien à afficher
    const noTabs = tabs !== null && tabs.length === 0 && !canEdit;
    if (noTabs) {
        if (homeNode) {
            return heroSlot ? <>{heroSlot(null)}{homeNode}</> : <>{homeNode}</>;
        }
        return (
            <p className="p-6 text-sm text-muted-foreground">Aucun contenu.</p>
        );
    }

    return (
        <>
        <AlertDialog
            open={!!confirmDeleteTab}
            onOpenChange={(open) => { if (!open) setConfirmDeleteTab(null); }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer l'onglet ?</AlertDialogTitle>
                    <AlertDialogDescription>
                        L'onglet <strong>{confirmDeleteTab?.label}</strong> et tout son contenu seront supprimés définitivement. Cette action est irréversible.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                            if (confirmDeleteTab) void deleteTab(confirmDeleteTab);
                            setConfirmDeleteTab(null);
                        }}
                    >
                        Supprimer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <Tabs
            value={current}
            onValueChange={selectTab}
            className={heroSlot ? "flex flex-col gap-8" : "flex h-full min-h-0 flex-col"}
        >
            {heroSlot ? heroSlot(makeBar("border-b-0 pb-0 px-0 justify-start")) : bar}

            {homeNode && (
                <TabsContent value={HOME_SLUG} className="m-0">
                    {homeNode}
                </TabsContent>
            )}

            {/* État vide : onglets chargés mais aucun (et droit d'en créer) */}
            {!homeNode && tabs !== null && tabs.length === 0 && (
                <p className="flex-1 p-6 text-sm text-muted-foreground">
                    Aucun onglet pour l'instant.
                </p>
            )}

            {/* Contenu: si renderTab n'est pas fourni, on montre un placeholder */}
            {(tabs ?? []).map((tab) => (
                <TabsContent
                    key={tab.id}
                    value={tab.slug}
                    className={heroSlot ? "pt-4" : "min-h-0 flex-1 overflow-y-auto p-4"}
                >
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
        </>
    );
}
