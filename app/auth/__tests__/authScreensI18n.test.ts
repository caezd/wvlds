import { describe, it, expect } from "vitest";
import { trackedSources } from "@/test/sourceFiles";

// ──────────────────────────────────────────────────────────────────────────
// Les écrans d'authentification sont les premiers qu'un visiteur voit, dans
// sa langue. Plusieurs gardaient pourtant du texte écrit en dur entre deux
// balises — « Lien invalide », « Définir un mot de passe », et une page
// d'erreur entière en anglais — qu'aucun autre contrôle ne voyait :
// `hardcodedFrenchUi` ne lit que les attributs et les exceptions.
//
// Tout texte de ces écrans passe donc par le namespace `auth`.
// ──────────────────────────────────────────────────────────────────────────

const AUTH_SCREENS = [
  "app/auth/*.tsx",
  "app/auth/**/*.tsx",
  "components/login-form.tsx",
  "components/sign-up-form.tsx",
  "components/forgot-password-form.tsx",
  "components/update-password-form.tsx",
  "components/auth/*.tsx",
];

/** Le source sans ses commentaires, pour ne pas y prendre de faux texte. */
function sansCommentaires(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("écrans d'authentification : aucun texte en dur", () => {
  const fichiers = trackedSources(AUTH_SCREENS).filter((f) => !f.file.includes("__tests__"));

  it("trouve bien les écrans à contrôler", () => {
    expect(fichiers.map((f) => f.file)).toEqual(
      expect.arrayContaining(["app/auth/layout.tsx", "app/auth/error/page.tsx", "components/login-form.tsx"]),
    );
  });

  it("pas de texte entre deux balises", () => {
    const fautes: string[] = [];
    for (const { file, source } of fichiers) {
      for (const m of sansCommentaires(source).matchAll(/>([^<>{}]*)</g)) {
        const texte = m[1].trim();
        // `useState<string | null>(null)` : un type générique, pas du texte.
        if (/[;=()]/.test(texte)) continue;
        if (/\p{L}{2,}/u.test(texte)) fautes.push(`${file} : « ${texte} »`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("pas de message d'erreur écrit en dur", () => {
    const fautes: string[] = [];
    const appel = /setError\(\s*(?:[^)]*\?\?\s*)?(["'`])((?:(?!\1).)+)\1/g;
    for (const { file, source } of fichiers) {
      for (const m of sansCommentaires(source).matchAll(appel)) {
        fautes.push(`${file} : « ${m[2]} »`);
      }
    }
    expect(fautes).toEqual([]);
  });
});
