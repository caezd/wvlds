import { requireAdmin } from "@/lib/admin";
import { CheckCircle2, XCircle } from "lucide-react";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

type Messages = Record<string, unknown>;

function flattenKeys(obj: Messages, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const sub of flattenKeys(value as Messages, fullKey)) keys.add(sub);
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

const LOCALES = [
  { code: "fr", label: "Français", data: fr },
  { code: "en", label: "English", data: en },
  { code: "es", label: "Español", data: es },
] as const;

export default async function AdminTranslationsPage() {
  await requireAdmin();

  const localeKeys = LOCALES.map(({ code, label, data }) => ({
    code,
    label,
    keys: flattenKeys(data as Messages),
  }));

  const allKeys = new Set(localeKeys.flatMap(({ keys }) => [...keys]));
  const sortedKeys = [...allKeys].sort();

  const incompleteKeys = sortedKeys.filter(
    (k) => !localeKeys.every(({ keys }) => keys.has(k))
  );

  // Group keys by namespace (first segment)
  const byNamespace = new Map<string, string[]>();
  for (const key of sortedKeys) {
    const ns = key.split(".")[0];
    const group = byNamespace.get(ns) ?? [];
    group.push(key);
    byNamespace.set(ns, group);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Traductions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {allKeys.size} clé{allKeys.size !== 1 ? "s" : ""} au total
        </p>
      </div>

      {/* Coverage summary */}
      <div className="grid grid-cols-3 gap-4">
        {localeKeys.map(({ code, label, keys }) => {
          const pct = Math.round((keys.size / allKeys.size) * 100);
          const missing = allKeys.size - keys.size;
          return (
            <div key={code} className="rounded-xl border border-border-soft p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{label}</span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    pct === 100
                      ? "text-green-500"
                      : pct >= 80
                        ? "text-yellow-500"
                        : "text-destructive"
                  }`}
                >
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct === 100 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-destructive"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {keys.size} / {allKeys.size} clés
                {missing > 0 && (
                  <span className="text-destructive ml-1">
                    · {missing} manquante{missing > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* Incomplete keys callout */}
      {incompleteKeys.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
            {incompleteKeys.length} clé{incompleteKeys.length > 1 ? "s" : ""} incomplète
            {incompleteKeys.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-1">
            {incompleteKeys.map((key) => {
              const missingLocales = localeKeys
                .filter(({ keys }) => !keys.has(key))
                .map(({ label }) => label);
              return (
                <li key={key} className="flex items-center gap-3 text-xs">
                  <code className="font-mono text-muted-foreground flex-1">{key}</code>
                  <span className="text-destructive shrink-0">
                    manquant en {missingLocales.join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Full table by namespace */}
      <div className="space-y-4">
        {[...byNamespace.entries()].map(([ns, keys]) => (
          <div key={ns}>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1 mb-2">
              {ns}
            </h2>
            <div className="rounded-xl border border-border-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">
                      Clé
                    </th>
                    {localeKeys.map(({ code, label }) => (
                      <th
                        key={code}
                        className="text-center px-4 py-2 font-medium text-muted-foreground text-xs w-28"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {keys.map((key) => {
                    const incomplete = !localeKeys.every(({ keys: k }) => k.has(key));
                    return (
                      <tr key={key} className={incomplete ? "bg-yellow-500/5" : undefined}>
                        <td className="px-4 py-2.5">
                          <code className="text-xs font-mono text-muted-foreground">{key}</code>
                        </td>
                        {localeKeys.map(({ code, keys: k }) => (
                          <td key={code} className="px-4 py-2.5 text-center">
                            {k.has(key) ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
