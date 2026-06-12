import { ChangelogFilters } from "./ChangelogFilters";

export default function ChangelogPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <header className="space-y-1 pb-2 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight">Changelog</h1>
        <p className="text-sm text-muted-foreground">
          Nouveautés et mises à jour de la plateforme.
        </p>
      </header>
      <ChangelogFilters />
    </div>
  );
}
