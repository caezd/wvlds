// Données pour l'autocomplétion des tokens `dans:` (salons) et `de:` /
// `mentions:` (auteurs) du centre de recherche. Le filtre "auteur" doit
// pouvoir cibler soit un pseudo de joueur (profil), soit un nom de persona —
// les deux listes sont donc récupérées et fusionnées côté client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";

export type SearchChatroomOption = {
  id: string;
  label: string;
};

export type SearchAuthorOption =
  | { kind: "profile"; id: string; label: string; avatarUrl: string | null }
  | { kind: "persona"; id: string; label: string; sublabel: string | null; avatarUrl: string | null };

/**
 * Retire les diacritiques et la casse, pour comparer ce qui est SAISI à ce qui
 * est affiché.
 *
 * Sans cela, taper « de:elodie » ne trouvait pas « Élodie » : le filtre se
 * contentait de `toLowerCase()`, qui laisse les accents intacts. Sur une
 * application très majoritairement francophone, c'est la moitié des prénoms qui
 * échappent à la recherche dès qu'on ne les accentue pas en tapant.
 */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Salons du monde, pour l'autocomplétion du filtre `dans:`.
 *
 * @param libelleParDefaut nom affiché pour un salon sans titre ; il apparaît
 *   à l'écran, il doit donc être traduit par l'appelant
 */
export async function listWorldChatroomsForSearch(
  supabase: SupabaseClient,
  worldId: string,
  libelleParDefaut: string,
): Promise<SearchChatroomOption[]> {
  const { data } = await supabase
    .from(TABLE.CHATROOMS)
    .select("id, title, name")
    .eq("world_id", worldId);

  // Le tri se fait ICI, sur le libellé réellement affiché, et non côté base sur
  // `name`. Les deux colonnes coexistent : `title` est ce que l'utilisateur
  // nomme, `name` garde le plus souvent sa valeur par défaut. Relevé en base :
  // les 34 salons portent le même `name`, tous avec un `title` distinct — trier
  // dessus revenait à ne pas trier du tout, et la liste sortait dans un ordre
  // arbitraire.
  //
  // `localeCompare` plutôt qu'une comparaison d'octets : « Élodie » se range
  // entre « Elena » et « Emma », pas après « Zoé ». Locale du navigateur, donc
  // celle de la personne qui lit.
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      label: ((r.title ?? r.name) as string | null)?.trim() || libelleParDefaut,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
}

export async function listWorldAuthorsForSearch(
  supabase: SupabaseClient,
  worldId: string,
): Promise<SearchAuthorOption[]> {
  const [membersRes, personasRes] = await Promise.all([
    supabase.from(TABLE.WORLD_MEMBERS).select("user_id").eq("world_id", worldId),
    supabase
      .from(TABLE.PERSONAS)
      .select("id, name, avatar_url, user_id")
      .eq("world_id", worldId)
      .is("deleted_at", null),
  ]);

  const memberIds = (membersRes.data ?? []).map((r) => r.user_id as string);
  const personaOwnerIds = (personasRes.data ?? [])
    .map((p) => p.user_id as string | null)
    .filter((id): id is string => Boolean(id));
  const allIds = [...new Set([...memberIds, ...personaOwnerIds])];

  const { data: profileRows } = allIds.length > 0
    ? await supabase.from(TABLE.PROFILES).select("id, username, avatar_url").in("id", allIds)
    : { data: [] as { id: string; username: string | null; avatar_url: string | null }[] };

  const profileById = new Map<string, { username: string | null; avatar_url: string | null }>();
  for (const p of profileRows ?? []) {
    profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null });
  }

  const profiles: SearchAuthorOption[] = memberIds
    .map((id) => ({ id, profile: profileById.get(id) }))
    .filter((m): m is { id: string; profile: { username: string | null; avatar_url: string | null } } => Boolean(m.profile))
    .map(({ id, profile }) => ({
      kind: "profile",
      id,
      label: profile.username ?? id,
      avatarUrl: profile.avatar_url,
    }));

  const personas: SearchAuthorOption[] = (personasRes.data ?? []).map((p) => {
    const owner = p.user_id ? profileById.get(p.user_id as string) : undefined;
    return {
      kind: "persona",
      id: p.id as string,
      label: p.name as string,
      sublabel: owner?.username ?? null,
      avatarUrl: p.avatar_url as string | null,
    };
  });

  return [...personas, ...profiles];
}

export function matchesAuthorQuery(option: SearchAuthorOption, query: string): boolean {
  const q = normaliserPourRecherche(query);
  if (!q) return true;
  if (normaliserPourRecherche(option.label).includes(q)) return true;
  if (option.kind === "persona" && option.sublabel && normaliserPourRecherche(option.sublabel).includes(q)) {
    return true;
  }
  return false;
}

/** Même comparaison, pour l'autocomplétion des salons. */
export function matchesChatroomQuery(option: SearchChatroomOption, query: string): boolean {
  const q = normaliserPourRecherche(query);
  if (!q) return true;
  return normaliserPourRecherche(option.label).includes(q);
}
