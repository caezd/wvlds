import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Mot du jour — sources externes
// ---------------------------------------------------------------------------

const WORDLIST_FALLBACK = [
  "crépuscule", "mélancolie", "frénésie", "sérénité", "torpeur",
  "nostalgie", "vertige", "mystère", "splendeur", "abîme",
  "aurore", "brume", "cendres", "effroi", "ferveur",
  "gravité", "harmonie", "illusion", "lassitude", "mémoire",
  "néant", "ombre", "passion", "rancœur", "silence",
  "terreur", "ardeur", "bravoure", "désespoir", "errance",
  "gloire", "honte", "ivresse", "liberté", "murmure",
  "noblesse", "orgueil", "péril", "quête", "regret",
  "souffle", "trahison", "vaillance", "angoisse", "blessure",
  "clémence", "déchirement", "éclipse", "fatalité", "grâce",
  "hasard", "infortune", "langueur", "malédiction", "naufrage",
  "obscurité", "pressentiment", "rêverie", "soupçon", "témérité",
  "vengeance", "zénith", "affliction", "châtiment", "déclin",
  "exil", "fierté", "guérison", "immensité", "larmes",
  "miroir", "nuit", "oubli", "pardon", "ruine",
  "sanctuaire", "solitude", "tumulte", "vertu", "vestige",
];

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

async function fetchTrouveMot(): Promise<{ word: string; category: string } | null> {
  try {
    const res = await fetch("https://trouve-mot.fr/api/random", {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ name: string; categorie: string }>;
    if (!data?.[0]?.name) return null;
    return { word: data[0].name, category: data[0].categorie };
  } catch {
    return null;
  }
}

async function fetchWiktionaryDefinition(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://fr.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
      { headers: { "Accept": "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.extract as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pool de défis statiques (tous les kinds sauf contains_word qui est dynamique)
// ---------------------------------------------------------------------------

type ChallengePayload = {
  title: string;
  description: string;
  validation: Record<string, unknown>;
  reward_coins: number;
  reward_xp: number;
  min_word_count: number;
  source: string;
};

const STATIC_CHALLENGES: ChallengePayload[] = [
  // --- no_word ---------------------------------------------------------------
  {
    title: "Mot interdit : « soudain »",
    description: "Rédigez votre prochain message **sans utiliser** le mot **« soudain »**.\n\n*Un seul écart et le défi est perdu.*",
    validation: { kind: "no_word", value: "soudain" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Mot interdit : « mais »",
    description: "Rédigez votre prochain message **sans utiliser** le mot **« mais »**.\n\n*Un seul écart et le défi est perdu.*",
    validation: { kind: "no_word", value: "mais" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Mot interdit : « alors »",
    description: "Rédigez votre prochain message **sans utiliser** le mot **« alors »**.\n\n*Un seul écart et le défi est perdu.*",
    validation: { kind: "no_word", value: "alors" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Mot interdit : « vraiment »",
    description: "Rédigez votre prochain message **sans utiliser** le mot **« vraiment »**.\n\n*Un seul écart et le défi est perdu.*",
    validation: { kind: "no_word", value: "vraiment" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  // --- word_count_range -------------------------------------------------------
  {
    title: "Longueur exacte : 150–250 mots",
    description: "Rédigez un message comportant **entre 150 et 250 mots**.\n\n*Un développement narratif complet — posez le décor, les émotions, l'action.*",
    validation: { kind: "word_count_range", min: 150, max: 250 },
    reward_coins: 15, reward_xp: 10, min_word_count: 0, source: "admin",
  },
  {
    title: "Longueur exacte : 200–350 mots",
    description: "Rédigez un message comportant **entre 200 et 350 mots**.\n\n*Une réponse longue et travaillée — richesse et profondeur exigées.*",
    validation: { kind: "word_count_range", min: 200, max: 350 },
    reward_coins: 20, reward_xp: 15, min_word_count: 0, source: "admin",
  },
  {
    title: "Longueur exacte : 100–175 mots",
    description: "Rédigez un message comportant **entre 100 et 175 mots**.\n\n*La longueur d'un bon paragraphe roleplay — ni trop court, ni trop long.*",
    validation: { kind: "word_count_range", min: 100, max: 175 },
    reward_coins: 15, reward_xp: 10, min_word_count: 0, source: "admin",
  },
  // --- starts_with ------------------------------------------------------------
  {
    title: "Incipit imposé : « Dans l'obscurité »",
    description: "Commencez votre message par **« Dans l'obscurité »**.\n\n*Les premières lettres comptent — lancez-vous avec style.*",
    validation: { kind: "starts_with", value: "Dans l'obscurité" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Incipit imposé : « Je n'aurais jamais »",
    description: "Commencez votre message par **« Je n'aurais jamais »**.\n\n*Les premières lettres comptent — lancez-vous avec style.*",
    validation: { kind: "starts_with", value: "Je n'aurais jamais" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Incipit imposé : « Autrefois »",
    description: "Commencez votre message par **« Autrefois »**.\n\n*Plongez dans le passé dès le premier mot.*",
    validation: { kind: "starts_with", value: "Autrefois" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  {
    title: "Incipit imposé : « Il était une fois »",
    description: "Commencez votre message par **« Il était une fois »**.\n\n*La formule classique — mais ce qui suit doit briller.*",
    validation: { kind: "starts_with", value: "Il était une fois" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  // --- ends_with_question -----------------------------------------------------
  {
    title: "Question finale",
    description: "Terminez votre message par une **question**.\n\n*Votre réponse doit se conclure par un point d'interrogation « ? ».*",
    validation: { kind: "ends_with_question" },
    reward_coins: 15, reward_xp: 10, min_word_count: 20, source: "admin",
  },
  // --- no_adverb_ly -----------------------------------------------------------
  {
    title: "Pas d'adverbe en -ment",
    description: "Rédigez votre message **sans utiliser d'adverbe** se terminant par **-ment**, **-amment** ou **-emment**.\n\n*Interdits : rapidement, élégamment, apparemment…*",
    validation: { kind: "no_adverb_ly" },
    reward_coins: 20, reward_xp: 15, min_word_count: 20, source: "admin",
  },
  // --- contains_regex ---------------------------------------------------------
  {
    title: "Motif imposé : sang, larmes ou sueur",
    description: "Votre message doit mentionner **au moins un** de ces mots : *sang*, *larmes* ou *sueur*.\n\n*L'intensité dramatique est de mise.*",
    validation: { kind: "contains_regex", pattern: "\\b(sang|larmes|sueur)\\b" },
    reward_coins: 25, reward_xp: 20, min_word_count: 20, source: "admin",
  },
  {
    title: "Motif imposé : jamais / toujours / parfois",
    description: "Votre message doit contenir **au moins un** de ces mots : *jamais*, *toujours* ou *parfois*.\n\n*Une nuance temporelle pour enrichir votre récit.*",
    validation: { kind: "contains_regex", pattern: "\\b(jamais|toujours|parfois)\\b" },
    reward_coins: 20, reward_xp: 15, min_word_count: 20, source: "admin",
  },
  {
    title: "Motif imposé : lumière ou ombre",
    description: "Votre message doit contenir le mot **lumière** ou le mot **ombre**.\n\n*Le contraste est au cœur du récit.*",
    validation: { kind: "contains_regex", pattern: "\\b(lumière|ombre)\\b" },
    reward_coins: 20, reward_xp: 15, min_word_count: 20, source: "admin",
  },
];

// ---------------------------------------------------------------------------
// Sélection du défi du jour — aléatoire pur
// ---------------------------------------------------------------------------

// Le pool compte STATIC_CHALLENGES.length + 1 (le slot mot du jour).
// Chaque option a une probabilité égale d'être tirée.

async function buildChallenge(
  today: Date,
): Promise<{ payload: ChallengePayload & { active_date: string; world_id: null }; kind: string }> {
  const todayStr = today.toISOString().split("T")[0];

  const totalOptions = STATIC_CHALLENGES.length + 1; // +1 pour le mot du jour
  const pick = Math.floor(Math.random() * totalOptions);
  const isWordOfDay = pick === totalOptions - 1; // dernier slot = mot du jour

  if (isWordOfDay) {
    // --- Mot du jour ---
    let word: string;
    let category: string | null = null;
    const apiResult = await fetchTrouveMot();
    if (apiResult) {
      word = apiResult.word;
      category = apiResult.category;
    } else {
      word = WORDLIST_FALLBACK[getDayOfYear(today) % WORDLIST_FALLBACK.length];
    }
    const definition = await fetchWiktionaryDefinition(word);

    const lines: string[] = [`Intégrez le mot **« ${word} »** dans votre prochain message de chatroom.`];
    if (definition) {
      const short = definition.length > 220 ? definition.slice(0, 217) + "…" : definition;
      lines.push(`\n*${short}*`);
    }
    if (category) lines.push(`\n**Catégorie :** ${category.toLowerCase()}`);

    return {
      kind: "word_of_day",
      payload: {
        title: `Mot du jour : ${word}`,
        description: lines.join("\n"),
        validation: { kind: "contains_word", value: word },
        reward_coins: 15,
        reward_xp: 10,
        min_word_count: 20,
        source: "word_of_day",
        active_date: todayStr,
        world_id: null,
      },
    };
  }

  // --- Défi statique ---
  const challenge = STATIC_CHALLENGES[pick];

  return {
    kind: challenge.validation.kind as string,
    payload: { ...challenge, active_date: todayStr, world_id: null },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const yesterdayStr = new Date(today.getTime() - 86_400_000).toISOString().split("T")[0];

  // 1. Expirer les défis d'hier
  const { error: expireError } = await supabase.rpc("expire_daily_challenges", {
    p_date: yesterdayStr,
  });
  if (expireError) console.error("expire error:", expireError.message);

  // 2. Construire le défi du jour
  const { payload, kind } = await buildChallenge(today);

  // 3. Insertion idempotente (contrainte unique sur active_date + source + world_id IS NULL)
  const { error: insertError } = await supabase.from("challenges").insert(payload);

  if (insertError && insertError.code !== "23505") {
    console.error("insert error:", insertError.message);
    return new Response(
      JSON.stringify({ ok: false, error: insertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, kind, title: payload.title, date: payload.active_date }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
