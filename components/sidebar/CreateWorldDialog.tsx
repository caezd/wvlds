"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";

export function CreateWorldDialog({
  disabled,
  plan,
  ownedCount,
  quotaLimit,
  trigger,
}: {
  disabled?: boolean;
  plan: "free" | "subscribed" | "lifetime";
  ownedCount: number;
  quotaLimit: number;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("worlds");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!name) return;

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("worlds")
        .insert({ owner_id: user.id, name, description })
        .select("id")
        .single();

      if (!error && data?.id) {
        setOpen(false);
        router.push(`/w/${data.id}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" disabled={disabled} className="w-full justify-start">
            {t("newWorld")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newWorld")}</DialogTitle>
        </DialogHeader>
        {plan === "free" && disabled ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            Ton quota gratuit est atteint ({ownedCount}/{quotaLimit}). Passe à un plan supérieur pour créer plus de mondes.
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => { e.preventDefault(); handleCreate(new FormData(e.currentTarget)); }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="cwd-name">{t("name")}</Label>
              <Input id="cwd-name" name="name" placeholder="Ex. Avalonia" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cwd-desc">Description</Label>
              <Input id="cwd-desc" name="description" placeholder="Optionnel" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
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
