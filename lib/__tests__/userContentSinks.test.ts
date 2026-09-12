import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { trackedSources } from "@/test/sourceFiles";

// ──────────────────────────────────────────────────────────────────────────
// Les puits où du contenu utilisateur pourrait devenir du script.
//
// L'application ne rend jamais de HTML brut venu d'un utilisateur : le
// Markdown passe par react-markdown + rehype-sanitize (schéma par défaut,
// sans rehype-raw), le bloc « HTML libre » de l'accueil est analysé puis
// rendu par React à partir d'une liste blanche (homeHtmlBlock.ts), et les
// URL enregistrées passent par `isSafeUrl`, `sanitizeBannerUrl` ou
// `httpUrlSchema`. C'est un état, pas une propriété : il suffit d'un
// `dangerouslySetInnerHTML` de plus pour le perdre, et rien dans la
// compilation ne le signalerait.
//
// Ce contrôle fige les trois points qui font tenir cet état.
// ──────────────────────────────────────────────────────────────────────────

/** La source sans ses commentaires de ligne : on cherche du code, pas des explications. */
const sansCommentaires = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");

const sources = trackedSources(["app/*.ts", "app/*.tsx", "components/*.ts", "components/*.tsx", "lib/*.ts", "lib/*.tsx", "hooks/*.ts", "hooks/*.tsx"])
  .filter(({ file }) => !file.includes("__tests__") && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
  .map(({ file, source }) => ({ file, source: sansCommentaires(source) }));

/**
 * Les seuls fichiers autorisés à écrire du HTML tel quel — chacun avec la
 * raison qui le rend sûr. Ajouter une entrée ici est une décision de
 * sécurité : dire pourquoi.
 */
const RAW_HTML_ALLOWED: Record<string, string> = {
  // Sortie de shiki, qui échappe tout ce qu'il ne colore pas.
  "components/ui/code-editor.tsx": "shiki",
  // Une balise <style> seulement, dont le contenu est validé par
  // scopeBlockCss et débarrassé de toute séquence `</`.
  "components/worlds/home/blocks/WorldHomeHtmlBlockView.tsx": "CSS validé, jamais de balisage",
};

describe("puits de contenu utilisateur", () => {
  it("aucun dangerouslySetInnerHTML hors des deux emplacements justifiés", () => {
    const offenders = sources
      .filter(({ source }) => /dangerouslySetInnerHTML\s*=/.test(source))
      .map(({ file }) => file)
      .filter((file) => !(file in RAW_HTML_ALLOWED));
    expect(offenders).toEqual([]);
  });

  it("le Markdown n'est jamais rendu avec rehype-raw", () => {
    // rehype-raw réinjecte le HTML écrit dans le Markdown ; avec lui, un
    // `<img onerror>` dans un message de salon redevient du script.
    const offenders = sources.filter(({ source }) => /rehype-raw|rehypeRaw/.test(source)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("aucune URL n'est validée par un z.url() qui accepterait javascript:", () => {
    // `new URL("javascript:alert(1)")` est valide : `z.url()` et `z.string().url()`
    // laissent passer. Seul `httpUrlSchema` (lib/inputSchemas.ts) porte la
    // restriction de protocole ; tout le monde doit passer par lui.
    // `.url(` attrape aussi `z.string().trim().url(…)`, la forme héritée de zod 3.
    const offenders = sources
      .filter(({ file }) => file !== "lib/inputSchemas.ts")
      .filter(({ source }) => /\.url\s*\(/.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("httpUrlSchema restreint bien le protocole", () => {
    // Lu directement : un fichier pas encore indexé échappe à `git ls-files`.
    const schema = sansCommentaires(readFileSync("lib/inputSchemas.ts", "utf-8"));
    // Les deux formes — le schéma nu et la fabrique à message — portent la
    // restriction ; aucun `z.url(` du fichier ne doit s'en passer.
    const urlCalls = schema.match(/z\.url\([^)]*\)/g) ?? [];
    expect(urlCalls.length).toBeGreaterThan(0);
    for (const call of urlCalls) expect(call).toMatch(/protocol:\s*\/\^https\?\$\//);
  });
});
