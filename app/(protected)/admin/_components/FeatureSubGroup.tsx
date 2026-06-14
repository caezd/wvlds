"use client";

export type SubGroupFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  updated_at: string;
};

export function FeatureSubGroup({
  flag,
  onToggle,
  children,
}: {
  flag: SubGroupFlag;
  onToggle: () => Promise<void>;
  children: React.ReactNode;
}) {
  const date = new Date(flag.updated_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <details className="group/subgroup">
      <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer list-none">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{flag.label}</span>
            <code className="text-[0.65rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              {flag.key}
            </code>
            <svg
              className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 group-open/subgroup:rotate-90"
              viewBox="0 0 6 10"
              fill="none"
            >
              <path
                d="M1 1l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {flag.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {flag.description}
            </p>
          )}
          <p className="text-[0.65rem] text-muted-foreground/60 mt-1">
            Modifié le {date}
          </p>
        </div>

        <form action={onToggle}>
          <button
            type="submit"
            onClick={(e) => e.stopPropagation()}
            aria-label={flag.enabled ? "Désactiver" : "Activer"}
          >
            <div
              className={[
                "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
                flag.enabled ? "bg-primary" : "bg-muted",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transform transition-transform duration-200",
                  flag.enabled ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </div>
          </button>
        </form>
      </summary>

      <div
        className={[
          "border-t border-border-soft/60 divide-y divide-border-soft/60",
          !flag.enabled ? "opacity-40 pointer-events-none" : "",
        ].join(" ")}
      >
        {children}
      </div>
    </details>
  );
}
