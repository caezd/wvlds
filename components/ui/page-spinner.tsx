import Logo from "@/components/logo";

/** Squelette de chargement générique pour les `loading.tsx` de segments de route. */
export function PageSpinner() {
  return (
    <div className="flex h-full w-full flex-1 items-center justify-center p-10">
      <Logo
        className="h-8 w-auto animate-pulse text-muted-foreground"
        accent="var(--accent)"
      />
    </div>
  );
}
