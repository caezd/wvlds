"use client";

import { useActionState, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Loader2, ImageIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BUCKET = "cosmetics";

type Item = {
  id?: string;
  key?: string;
  name?: string;
  slot?: string;
  price_coins?: number;
  asset_url?: string;
  preview_url?: string | null;
  active?: boolean;
};

type ActionFn = (
  prevState: unknown,
  formData: FormData,
) => Promise<{ ok: boolean; error?: string }>;

// -- Image uploader --------------------------------------------

function ImageUploader({
  label,
  name,
  initialUrl,
  hint,
}: {
  label: string;
  name: string;
  initialUrl?: string | null;
  hint?: string;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState<string>(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Fichier image requis (PNG, JPEG, WEBP, GIF, SVG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Taille max : 2 Mo.");
      return;
    }

    setUploading(true);
    try {
      // Nom unique basé sur timestamp + nom d'origine
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur d'upload.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>

      {/* Zone de drop */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft transition-colors",
          uploading
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        {url ? (
          <>
            <img
              src={url}
              alt="Aperçu"
              className="max-h-24 max-w-[160px] rounded object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUrl("");
              }}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Supprimer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Upload en cours…</span>
          </>
        ) : (
          <>
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground text-center px-4">
              Glissez une image ici ou cliquez pour sélectionner
            </span>
          </>
        )}
      </div>

      {/* Fallback URL manuelle */}
      <Input
        placeholder="ou colle une URL directement"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="text-xs"
      />

      {/* Champ caché transmis au server action */}
      <input type="hidden" name={name} value={url} />

      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// -- Formulaire principal --------------------------------------

export function ShopItemForm({
  item,
  action,
  submitLabel,
}: {
  item?: Item;
  action: ActionFn;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [active, setActive] = useState(item?.active ?? true);
  const [slot, setSlot] = useState(item?.slot ?? "avatar_frame");

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {state && !state.ok && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Clé */}
      <div className="space-y-1">
        <Label htmlFor="key">Clé unique</Label>
        <Input
          id="key"
          name="key"
          defaultValue={item?.key}
          placeholder="ex: frame_gold_v1"
          required
          pattern="[a-z0-9_\-]+"
          title="Minuscules, chiffres, tirets ou underscores"
        />
        <p className="text-xs text-muted-foreground">
          Identifiant stable — ne pas modifier après création.
        </p>
      </div>

      {/* Nom */}
      <div className="space-y-1">
        <Label htmlFor="name">Nom affiché</Label>
        <Input
          id="name"
          name="name"
          defaultValue={item?.name}
          placeholder="Cadre doré"
          required
        />
      </div>

      {/* Slot */}
      <div className="space-y-1">
        <Label>Type (slot)</Label>
        <Select name="slot" value={slot} onValueChange={setSlot}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="avatar_frame">Cadre d&apos;avatar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prix */}
      <div className="space-y-1">
        <Label htmlFor="price_coins">Prix (coins)</Label>
        <Input
          id="price_coins"
          name="price_coins"
          type="number"
          min={0}
          defaultValue={item?.price_coins ?? 0}
          required
        />
      </div>

      {/* Asset — upload vers bucket cosmetics */}
      <ImageUploader
        label="Image de l'article (asset)"
        name="asset_url"
        initialUrl={item?.asset_url}
        hint="Utilisée en jeu autour de l'avatar. Recommandé : PNG 256×256 sur fond transparent."
      />

      {/* Preview — optionnel */}
      <ImageUploader
        label="Image de prévisualisation (optionnel)"
        name="preview_url"
        initialUrl={item?.preview_url}
        hint="Affichée dans la boutique. Si absente, l'asset est utilisé."
      />

      {/* Actif */}
      <div className="flex items-center gap-3">
        <Switch
          id="active"
          checked={active}
          onCheckedChange={setActive}
        />
        <Label htmlFor="active">Visible en boutique</Label>
      </div>
      <input type="hidden" name="active" value={active ? "true" : "false"} />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Enregistrement…
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/shop">Annuler</Link>
        </Button>
      </div>
    </form>
  );
}
