"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Plus } from "lucide-react";

export function PersonaPickerDialog({
    selected,
    onSelect,
    trigger,
    required = true,
}: {
    selected: Persona | null;
    onSelect: (persona: Persona | null) => void;
    trigger?: React.ReactNode; // custom trigger button (optional)
    required?: boolean; // whether selection is required
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [value, setValue] = useState<string>(selected?.id ?? "");

    useEffect(() => setValue(selected?.id ?? ""), [selected?.id, open]);

    useEffect(() => {
        if (!open) return;
        const load = async () => {
            setLoading(true);
            const supabase = createClient();
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                setPersonas([]);
                setLoading(false);
                return;
            }
            const { data } = await supabase
                .from("personas")
                .select("id, user_id, name, avatar_url")
                .eq("user_id", user.id)
                .order("name", { ascending: true });
            setPersonas(data ?? []);
            setLoading(false);
        };
        void load();
    }, [open]);

    function avatar(p: Persona) {
        return (
            <Avatar>
                {p.avatar_url && (
                    <AvatarImage src={p.avatar_url} alt={p.name} />
                )}
                <AvatarFallback className="bg-card-400">
                    {p.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
            </Avatar>
        );
    }

    const noneAvailable = !loading && personas.length === 0;
    const canConfirm = value !== "" && (!required || !!value);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        className="hover:bg-card-400 rounded-full p-0"
                        size={"icon"}
                    >
                        {selected ? (
                            <span className="inline-flex items-center">
                                {avatar(selected)}
                            </span>
                        ) : (
                            <Plus size={30} />
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Choisir un persona</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="p-4 text-sm text-muted-foreground">
                        Chargement…
                    </div>
                ) : (
                    <RadioGroup
                        value={value}
                        onValueChange={setValue}
                        className="space-y-2"
                    >
                        {personas.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center gap-3 rounded-lg border p-2"
                            >
                                <RadioGroupItem
                                    value={p.id}
                                    id={`persona-${p.id}`}
                                />
                                {avatar(p)}
                                <Label
                                    htmlFor={`persona-${p.id}`}
                                    className="cursor-pointer flex-1"
                                >
                                    {p.name}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                )}

                <DialogFooter className="gap-2">
                    <DialogClose asChild>
                        <Button variant="ghost">Annuler</Button>
                    </DialogClose>
                    <Button
                        disabled={!canConfirm || noneAvailable}
                        onClick={() => {
                            const chosen =
                                personas.find((p) => p.id === value) ?? null;
                            onSelect(chosen);
                            setOpen(false);
                        }}
                    >
                        Confirmer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
