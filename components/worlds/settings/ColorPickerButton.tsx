"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

/**
 * Pastille de couleur qui déplie un sélecteur HSV.
 *
 * Rendu inline (pas de portail) pour éviter que Radix Dialog interprète le
 * pointerdown sur le canvas HSV comme un clic hors du dialog.
 */
export function ColorPickerButton({
  color,
  onChange,
  disabled,
  className,
}: {
  color: string;
  onChange: (c: string) => void;
  disabled?: boolean;
  /** Classes du bouton — pour caler sa hauteur sur les champs voisins. */
  className?: string;
}) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn("h-8 w-8 shrink-0 rounded-md border border-border shadow-sm transition-shadow hover:ring-2 hover:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)}
        style={{ backgroundColor: color }}
        aria-label={tCommon("chooseColor")}
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-lg border border-border bg-popover p-3 shadow-md">
          <HsvColorPicker color={color} onChange={onChange} presets={[]} />
        </div>
      )}
    </div>
  );
}
