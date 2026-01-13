// components/personas/PersonaEditSheet.tsx
"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogHeaderUI,
  DialogTitle as DialogTitleUI,
  DialogDescription as DialogDescriptionUI,
} from "@/components/ui/dialog";

import { PersonaSectionsTabs } from "./PersonaSectionsTabs";
import type { PersonaSectionWithFields } from "@/types/personas";

import {
  PersonaAvatarPicker,
  type AvatarConfigV1,
} from "./avatar/PersonaAvatarPicker";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "P";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

type PersonaEditSheetProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
};

export function PersonaEditSheet({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
}: PersonaEditSheetProps) {
  const [open, setOpen] = useState(false);

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialAvatarUrl ?? null,
  );
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfigV1 | null>(
    initialAvatarConfig ?? null,
  );

  const avatarFallback = useMemo(() => initials(personaName), [personaName]);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setAvatarDialogOpen(false);
      }}
    >
      <SheetTrigger asChild>
        <button className="text-sm underline">Éditer</button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-3xl">
        {/* Header style Facebook */}
        <div>
          <div className="relative overflow-hidden">
            <div className="h-28 bg-gradient-to-r from-muted/60 to-muted" />
            <div className="px-4 pb-4">
              <div className="relative -mt-10 flex items-end gap-4">
                <button
                  type="button"
                  onClick={() => setAvatarDialogOpen(true)}
                  className="group relative h-20 w-20 rounded-full border-4 border-background bg-muted overflow-hidden shadow"
                  aria-label="Modifier l’avatar"
                  title="Modifier l’avatar"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-lg font-semibold text-muted-foreground">
                      {avatarFallback}
                    </div>
                  )}

                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/30 grid place-items-center">
                    <div className="text-xs text-white font-medium">
                      Modifier
                    </div>
                  </div>
                </button>

                <div className="pb-1">
                  <div className="text-lg font-semibold leading-tight">
                    {personaName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal éditeur d’avatar */}
        <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[90vh] overflow-hidden p-0 gap-0">
            <div className="p-4">
              <DialogHeaderUI>
                <DialogTitleUI>Éditeur d’avatar</DialogTitleUI>
                <DialogDescriptionUI>
                  Construisez votre avatar en utilisant le générateur
                  ci-dessous.
                </DialogDescriptionUI>
              </DialogHeaderUI>
            </div>
            <div className="border-t p-4 overflow-auto max-h-[calc(90vh-96px)]">
              <PersonaAvatarPicker
                personaId={personaId}
                initialAvatarUrl={avatarUrl}
                initialConfig={avatarConfig}
                onSaved={(next) => {
                  setAvatarUrl(next.avatarUrl ?? null);
                  setAvatarConfig(next.config ?? null);
                  setAvatarDialogOpen(false);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Fiche persona */}
        <div className=" space-y-4">
          <PersonaSectionsTabs
            personaId={personaId}
            initialSections={initialSections}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
