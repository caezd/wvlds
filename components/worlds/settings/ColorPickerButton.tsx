"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

/**
 * Pastille de couleur qui déplie le sélecteur de couleur.
 *
 * Rendu inline (pas de portail) pour éviter que Radix Dialog interprète le
 * pointerdown sur la zone de saturation comme un clic hors du dialog.
 */
export function ColorPickerButton({
  color,
  onChange,
  disabled,
  alpha = true,
  className,
  children,
  onClose,
}: {
  color: string;
  onChange: (c: string) => void;
  disabled?: boolean;
  /** Curseur d'opacité ; à retirer quand la colonne n'admet que `#rrggbb`. */
  alpha?: boolean;
  /** Classes du bouton — pour caler sa hauteur sur les champs voisins. */
  className?: string;
  /** Posé sur la pastille, centré : l'icône d'un rôle. */
  children?: React.ReactNode;
  /** Le sélecteur se referme : le moment d'enregistrer la couleur choisie. */
  onClose?: () => void;
}) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  const close = React.useCallback(() => {
    setOpen(false);
    onCloseRef.current?.();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border shadow-sm transition-shadow hover:ring-2 hover:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)}
        style={{ backgroundColor: color }}
        aria-label={tCommon("chooseColor")}
      >
        {children}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-popover mt-1 w-64">
          <HsvColorPicker color={color} onChange={onChange} alpha={alpha} className="shadow-popover" />
        </div>
      )}
    </div>
  );
}
