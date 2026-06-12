"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

export function UsernameRequiredDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(true);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setError(
        "Le nom d'utilisateur doit contenir entre 3 et 32 caractères (lettres, chiffres, underscore)."
      );
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", userId);
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          throw new Error("Ce nom d'utilisateur est déjà pris.");
        }
        throw error;
      }
      setOpen(false);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choisissez un nom d&apos;utilisateur</DialogTitle>
          <DialogDescription>
            Un nom d&apos;utilisateur est requis pour continuer. Il sera
            visible par les autres membres de vos mondes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex gap-3 flex-col mb-4">
            <Label htmlFor="required-username">Nom d&apos;utilisateur</Label>
            <Input
              id="required-username"
              type="text"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]{3,32}"
              placeholder="mon_pseudo"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Enregistrement…" : "Confirmer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
