"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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

import { PersonaAvatarPicker } from "@/components/personas/avatar/PersonaAvatarPicker";
import {
  AVATAR_SIZE,
  avatarCategories,
  avatarParts,
} from "@/components/personas/avatar/avatarCatalog";
import type { AvatarConfig } from "@/components/personas/avatar/AvatarBuilder";

function hasAnyPick(cfg: AvatarConfig) {
  for (const v of Object.values(cfg.picks ?? {})) {
    if (Array.isArray(v) && v.length) return true;
    if (typeof v === "string" && v) return true;
  }
  return false;
}

export default function PersonaCreateDialog({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    picks: {},
    locks: {},
    bg: { color: "#0b1220" },
  });

  const [state, formAction, pending] = useActionState(createPersona, {
    ok: false as boolean,
    error: undefined as string | undefined,
  });

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  // Si l’utilisateur a sélectionné un avatar (picks) mais n’a pas appliqué (url vide), on bloque “Créer”
  const mustApplyAvatar = useMemo(
    () => hasAnyPick(avatarConfig) && !avatarUrl,
    [avatarConfig, avatarUrl],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Nouveau persona</Button>
      </DialogTrigger>

      {/* plus large qu’avant (sm:max-w-md) pour laisser de la place au builder */}
      <DialogContent className="w-full max-w-5xl">
        <DialogHeader>
          <DialogTitle>Créer un persona</DialogTitle>
        </DialogHeader>

        <form
          action={formAction}
          className="grid gap-6 lg:grid-cols-[360px_1fr]"
        >
          {/* Colonne gauche : infos de base */}
          <div className="space-y-3">
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

            {/* Hidden fields: ton action actuelle utilise avatar_url :contentReference[oaicite:3]{index=3} */}
            <input type="hidden" name="avatar_url" value={avatarUrl} />
            <input
              type="hidden"
              name="avatar_config"
              value={JSON.stringify(avatarConfig)}
            />

            {mustApplyAvatar ? (
              <p className="text-xs text-amber-500">
                Tu as modifié l’avatar, mais il n’est pas encore “appliqué”.
                Clique “Utiliser cet avatar”.
              </p>
            ) : null}

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending || mustApplyAvatar}>
                {pending ? "Création..." : "Créer"}
              </Button>
            </div>

            {state?.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
          </div>

          {/* Colonne droite : avatar builder */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Avatar</Label>

            <PersonaAvatarPicker
              categories={avatarCategories}
              parts={avatarParts}
              size={AVATAR_SIZE} // 600
              value={{ url: avatarUrl, config: avatarConfig }}
              onChange={(next) => {
                setAvatarUrl(next.url);
                setAvatarConfig(next.config);
              }}
              avatarBucket="avatars"
              avatarFolder="personas"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
