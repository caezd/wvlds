"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Visibility = "private" | "public";

const VISIBILITY_OPTIONS: { value: Visibility; icon: React.ElementType; label: string; description: string }[] = [
  {
    value: "private",
    icon: Lock,
    label: "Privé",
    description: "Accessible sur invitation uniquement.",
  },
  // {
  //   value: "public",
  //   icon: Globe,
  //   label: "Public",
  //   description: "Visible et accessible par tous.",
  // },
];

export function CreateWorldButton({
  label,
  disabled = false,
  quotaReached = false,
}: {
  label?: string;
  disabled?: boolean;
  quotaReached?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleCreate(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!name) return;

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("worlds")
        .insert({ owner_id: user.id, name, description, visibility })
        .select("id")
        .single();

      if (!error && data?.id) {
        setOpen(false);
        router.push(`/w/${data.id}`);
      } else {
        console.error(error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setVisibility("private"); }}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled} title={quotaReached ? "Quota atteint — passe à un plan supérieur" : undefined}>
          <Plus className="h-4 w-4 mr-1" />
          {label ?? "Nouveau monde"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau monde</DialogTitle>
        </DialogHeader>
        {quotaReached ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            Ton quota gratuit est atteint. Passe à un plan supérieur pour créer plus de mondes.
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(new FormData(e.currentTarget));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nom du monde</Label>
              <Input id="name" name="name" placeholder="Ex. Avalonia" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="Optionnel" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
