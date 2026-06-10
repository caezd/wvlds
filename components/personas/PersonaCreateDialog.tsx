"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createPersona } from "@/app/(protected)/p/actions";

type ActionState = { ok: boolean; error?: string; id?: string };

export default function PersonaCreateDialog({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    createPersona as (s: unknown, f: FormData) => Promise<ActionState>,
    { ok: false } as ActionState,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Nouveau persona</Button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un persona</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nom</Label>
            <Input
              name="name"
              placeholder="Ex. Kaori"
              required
              maxLength={40}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Bio</Label>
            <Textarea
              name="bio"
              placeholder="Quelques lignes sur le personnage"
              maxLength={500}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Création..." : "Créer"}
            </Button>
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
