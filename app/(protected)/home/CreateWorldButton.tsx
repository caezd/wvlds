"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";

type Visibility = "private" | "public";

export function CreateWorldButton({
  label,
  disabled = false,
  quotaReached = false,
}: {
  label?: string;
  disabled?: boolean;
  quotaReached?: boolean;
}) {
  const t = useTranslations("home");
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
        <Button size="sm" disabled={disabled} title={quotaReached ? t("quotaTooltip") : undefined}>
          <Plus className="h-4 w-4 mr-1" />
          {label ?? t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        {quotaReached ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            {t("newQuotaMessage")}
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
              <Label htmlFor="name">{t("newNameLabel")}</Label>
              <Input id="name" name="name" placeholder={t("newNamePlaceholder")} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">{t("newDescLabel")}</Label>
              <Input id="description" name="description" placeholder={t("newDescPlaceholder")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("newCancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("newCreate")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
