import { requireAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { FLAG_KEYS, type FlagKey } from "@/lib/featureFlags";
import { FeatureSubGroup } from "../_components/FeatureSubGroup";

type FlagRow = {
  key: FlagKey;
  enabled: boolean;
  label: string;
  description: string;
  updated_at: string;
};

const FIELD_KEYS: FlagKey[] = [
  "persona_field_title",
  "persona_field_text",
  "persona_field_stats",
  "persona_field_separator",
  "persona_field_image_grid",
  "persona_field_inventory",
  "persona_field_skills",
  "persona_field_gauges",
  "persona_field_quote",
  "persona_field_traits",
  "persona_field_timeline",
];

const BLOCK_KEYS: FlagKey[] = [
  "block_npc",
  "block_hp",
];

type GroupDef = {
  title: string;
  keys: FlagKey[];
  subgroups?: { masterKey: FlagKey; childKeys: FlagKey[] }[];
};

const GROUPS: GroupDef[] = [
  { title: "Compte",   keys: ["notifications"] },
  {
    title: "Personas",
    keys: ["avatar_builder", "persona_fields"],
    subgroups: [{ masterKey: "persona_fields", childKeys: FIELD_KEYS }],
  },
  { title: "Boutique", keys: ["shop"] },
  { title: "Mondes",   keys: ["public_worlds", "world_map", "world_catalogue"] },
  {
    title: "Chatrooms",
    keys: ["create_chatroom", "post_message", "emoji_reactions", "chatroom_media", "chatroom_blocks"],
    subgroups: [{ masterKey: "chatroom_blocks", childKeys: BLOCK_KEYS }],
  },
];

async function toggleFlag(key: FlagKey, enabled: boolean) {
  "use server";
  const { supabase } = await requireAdmin();
  await supabase
    .from("feature_flags")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("key", key);
  revalidatePath("/admin/features");
  revalidatePath("/", "layout");
}

function FlagRow({ flag }: { flag: FlagRow }) {
  const toggle = toggleFlag.bind(null, flag.key, !flag.enabled);
  const date = new Date(flag.updated_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{flag.label}</span>
          <code className="text-[0.65rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
            {flag.key}
          </code>
        </div>
        {flag.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{flag.description}</p>
        )}
        <p className="text-[0.65rem] text-muted-foreground/60 mt-1">Modifié le {date}</p>
      </div>
      <form action={toggle}>
        <button
          type="submit"
          aria-label={flag.enabled ? "Désactiver" : "Activer"}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent",
            "transition-colors duration-200",
            flag.enabled ? "bg-primary" : "bg-muted",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg",
              "transform transition-transform duration-200",
              flag.enabled ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </form>
    </div>
  );
}

function CompactFlagRow({ flag }: { flag: FlagRow }) {
  const toggle = toggleFlag.bind(null, flag.key, !flag.enabled);
  const label = flag.label.replace(/^Champ : /, "");
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <form action={toggle}>
        <button
          type="submit"
          aria-label={flag.enabled ? "Désactiver" : "Activer"}
          className={[
            "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
            flag.enabled ? "bg-primary" : "bg-muted",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow",
              "transform transition-transform duration-200",
              flag.enabled ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </form>
    </div>
  );
}

export default async function AdminFeaturesPage() {
  const { supabase } = await requireAdmin();

  const { data: flags, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, label, description, updated_at")
    .in("key", [...FLAG_KEYS]);

  if (error) {
    return <div className="text-sm text-destructive">Erreur : {error.message}</div>;
  }

  const byKey = Object.fromEntries((flags ?? []).map((f) => [f.key, f as FlagRow]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Fonctionnalités</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Activer ou désactiver des fonctionnalités sans déploiement.
        </p>
      </div>

      <div className="space-y-4">
        {GROUPS.map((group) => {
          const subgroupMasterKeys = new Set(group.subgroups?.map((s) => s.masterKey) ?? []);
          const topLevelKeys = group.keys.filter((k) => !subgroupMasterKeys.has(k));
          const topLevelFlags = topLevelKeys.map((k) => byKey[k]).filter(Boolean);
          const hasContent =
            topLevelFlags.length > 0 ||
            group.subgroups?.some((s) => byKey[s.masterKey]);
          if (!hasContent) return null;

          return (
            <div key={group.title}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1 mb-2">
                {group.title}
              </h2>
              <div className="rounded-xl border border-border-soft overflow-hidden divide-y divide-border-soft">
                {topLevelFlags.map((flag) => (
                  <FlagRow key={flag.key} flag={flag} />
                ))}
                {group.subgroups?.map(({ masterKey, childKeys }) => {
                  const master = byKey[masterKey];
                  if (!master) return null;
                  return (
                    <FeatureSubGroup
                      key={masterKey}
                      flag={master}
                      onToggle={toggleFlag.bind(null, master.key, !master.enabled)}
                    >
                      {childKeys.map((k) =>
                        byKey[k] ? <CompactFlagRow key={k} flag={byKey[k]} /> : null
                      )}
                    </FeatureSubGroup>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
