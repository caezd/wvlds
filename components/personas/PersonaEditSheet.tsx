// components/personas/PersonaEditSheet.tsx
"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogHeaderUI,
  DialogTitle as DialogTitleUI,
  DialogDescription as DialogDescriptionUI,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

function ExternalUrlTab({
  personaId,
  supabase,
  onSaved,
}: {
  personaId: string;
  supabase: ReturnType<typeof createClient>;
  onSaved: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  async function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);
    const { error: err } = await supabase
      .from("personas")
      .update({ avatar_url: trimmed, avatar_config: null })
      .eq("id", personaId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(trimmed);
  }

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">
        Colle l'URL d'une image hébergée (jpg, png, webp…).
      </p>
      <Input
        placeholder="https://example.com/image.jpg"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null); }}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      {url && (
        <div className="h-32 w-32 rounded-xl overflow-hidden border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={url}
            alt="Aperçu"
            className="h-full w-full object-cover"
            onError={() => setError("Impossible de charger cette image.")}
            onLoad={() => setError(null)}
          />
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={!url.trim() || saving}>
        {saving ? "Enregistrement…" : "Utiliser cette image"}
      </Button>
    </div>
  );
}

type PersonaEditSheetProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
  trigger?: ReactNode;
};

// ─── Contenu partagé entre édition et création ─────────────────────────────

type PersonaEditorContentProps = {
  personaId: string;
  personaName: string;
  initialSections: PersonaSectionWithFields[];
  initialAvatarUrl?: string | null;
  initialAvatarConfig?: AvatarConfigV1 | null;
};

export function PersonaEditorContent({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
}: PersonaEditorContentProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfigV1 | null>(initialAvatarConfig ?? null);
  const avatarFallback = useMemo(() => initials(personaName), [personaName]);

  return (
    <>
      {/* Header style profil */}
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
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full grid place-items-center text-lg font-semibold text-muted-foreground">
                    {avatarFallback}
                  </div>
                )}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/30 grid place-items-center">
                  <div className="text-xs text-white font-medium">Modifier</div>
                </div>
              </button>

              <div className="pb-1">
                <input
                  defaultValue={personaName}
                  onBlur={async (e) => {
                    const newName = e.target.value.trim();
                    if (!newName || newName === personaName) return;
                    const { error } = await supabase.from("personas").update({ name: newName }).eq("id", personaId);
                    if (error) { e.target.value = personaName; return; }
                    router.refresh();
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  maxLength={40}
                  placeholder="Nom du personnage"
                  className="text-lg font-semibold leading-tight bg-transparent outline-none border-none rounded px-1 -mx-1 hover:bg-muted/60 focus:bg-muted/60 focus:underline decoration-dotted underline-offset-4 placeholder:text-muted-foreground/40 w-48 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal éditeur d’avatar */}
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[90vh] overflow-hidden p-0 gap-0">
          <Tabs defaultValue="builder" className="flex flex-col h-full">
            <div className="p-4 pb-0">
              <DialogHeaderUI><DialogTitleUI>Avatar</DialogTitleUI></DialogHeaderUI>
              <TabsList className="mt-3">
                <TabsTrigger value="builder">Générateur</TabsTrigger>
                <TabsTrigger value="url">Image externe</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="builder" className="border-t overflow-auto max-h-[calc(90vh-96px)] p-4 mt-0">
              <PersonaAvatarPicker
                personaId={personaId}
                initialConfig={avatarConfig}
                onSaved={(next) => {
                  setAvatarUrl(next.avatarUrl ?? null);
                  setAvatarConfig(next.config ?? null);
                  setAvatarDialogOpen(false);
                }}
              />
            </TabsContent>
            <TabsContent value="url" className="p-4 mt-0">
              <ExternalUrlTab
                personaId={personaId}
                supabase={supabase}
                onSaved={(url) => {
                  setAvatarUrl(url);
                  setAvatarConfig(null);
                  setAvatarDialogOpen(false);
                  router.refresh();
                }}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Sections */}
      <div className="space-y-4">
        <PersonaSectionsTabs personaId={personaId} initialSections={initialSections} />
      </div>
    </>
  );
}

// ─── Sheet d’édition (existant) ────────────────────────────────────────────

export function PersonaEditSheet({
  personaId,
  personaName,
  initialSections,
  initialAvatarUrl,
  initialAvatarConfig,
  trigger,
}: PersonaEditSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger
        ? <span onClick={() => setOpen(true)} style={{ display: "contents" }}>{trigger}</span>
        : <button className="text-sm underline" onClick={() => setOpen(true)}>Éditer</button>
      }
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Éditer — {personaName}</SheetTitle>
          </SheetHeader>
          <PersonaEditorContent
            personaId={personaId}
            personaName={personaName}
            initialSections={initialSections}
            initialAvatarUrl={initialAvatarUrl}
            initialAvatarConfig={initialAvatarConfig}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
