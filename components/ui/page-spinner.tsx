import { Loader2 } from "lucide-react";

/** Squelette de chargement générique pour les `loading.tsx` de segments de route. */
export function PageSpinner() {
  return (
    <div className="flex h-full w-full flex-1 items-center justify-center p-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
