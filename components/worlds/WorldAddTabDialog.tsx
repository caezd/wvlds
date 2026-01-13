"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function slugify(input: string) {
    return input
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

type AddTabDialogProps = {
    worldId: string;
    nextIndex: number; // dernier index + 1
    onCreated?: (tab: {
        id: string;
        slug: string;
        label: string;
        sort_index: number;
        is_system: boolean;
    }) => void;
    trigger?: React.ReactNode; // bouton custom si besoin
};

export function WorldAddTabDialog({
    worldId,
    nextIndex,
    onCreated,
    trigger,
}: AddTabDialogProps) {
    const supabase = createClient();
    const [open, setOpen] = React.useState(false);
    const [label, setLabel] = React.useState("");
    const [loading, setLoading] = React.useState(false);

    const slug = React.useMemo(
        () => slugify(label || "nouvel-onglet"),
        [label]
    );

    async function handleCreate() {
        if (!label.trim()) {
            toast.error("Le nom de l’onglet est requis.");
            return;
        }
        setLoading(true);
        const { data, error } = await supabase
            .from("world_content_tabs")
            .insert({
                world_id: worldId,
                label: label.trim(),
                slug,
                sort_index: nextIndex,
                is_system: false,
            })
            .select("*")
            .single();

        setLoading(false);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Onglet créé");
        onCreated?.(data);
        setLabel("");
        setOpen(false);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? <Button variant="secondary">+ Onglet</Button>}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nouvel onglet</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <label className="text-sm font-medium">
                        Nom de l’onglet
                    </label>
                    <Input
                        placeholder="Ex: Personnages, Lieux, Chronologie…"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Slug&nbsp;: <code>{slug}</code>
                    </p>
                </div>
                <DialogFooter>
                    <Button onClick={handleCreate} disabled={loading}>
                        Créer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
