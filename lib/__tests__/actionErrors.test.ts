import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  messageErreurAction,
  ERR_NON_AUTHENTIFIE,
  ERR_VALEUR_NON_SUPPORTEE,
  ERR_ENREGISTREMENT,
} from "@/lib/actionErrors";

// ──────────────────────────────────────────────────────────────────────────
// Les actions serveur renvoyaient des phrases FRANÇAISES codées en dur, que
// 35 endroits affichent telles quelles dans une notification. Une personne
// lisant l'application en anglais ou en espagnol recevait donc du français.
//
// Et quand l'erreur venait de la base, c'est `error.message` de PostgreSQL qui
// s'affichait — « new row violates row-level security policy for table… ».
// Illisible, et cela expose le nom des tables et des règles.
//
// Une action renvoie désormais un CODE ; le client le traduit. Tout code
// inconnu — donc tout message brut de la base — retombe sur un message
// générique traduit.
// ──────────────────────────────────────────────────────────────────────────

/** `useTranslations("common")` factice : rend la clé demandée. */
const t = (cle: string) => `traduit:${cle}`;

describe("messageErreurAction", () => {
  it("distingue la session expirée, seul cas où l'on peut agir", () => {
    expect(messageErreurAction(ERR_NON_AUTHENTIFIE, t)).toBe("traduit:sessionExpired");
  });

  it("rend le message générique pour les autres codes connus", () => {
    // Une valeur refusée par la liste blanche n'arrive qu'avec un client
    // modifié : rien à expliquer à qui l'a provoquée.
    expect(messageErreurAction(ERR_VALEUR_NON_SUPPORTEE, t)).toBe("traduit:saveError");
    expect(messageErreurAction(ERR_ENREGISTREMENT, t)).toBe("traduit:saveError");
  });

  it("n'affiche JAMAIS un message brut de la base", () => {
    // Le cas qui comptait : ces chaînes arrivaient telles quelles à l'écran.
    const brut = 'new row violates row-level security policy for table "profiles"';
    expect(messageErreurAction(brut, t)).toBe("traduit:saveError");
    expect(messageErreurAction(brut, t)).not.toContain("profiles");
    expect(messageErreurAction("Police non supportée", t)).toBe("traduit:saveError");
  });

  it("supporte l'absence de code", () => {
    expect(messageErreurAction(undefined, t)).toBe("traduit:saveError");
    expect(messageErreurAction(null, t)).toBe("traduit:saveError");
  });

  it("n'utilise que des clés qui existent réellement", () => {
    // Une clé absente afficherait son propre nom à l'utilisateur.
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), "messages", "fr.json"), "utf-8"),
    ) as { common: Record<string, unknown> };
    for (const cle of ["sessionExpired", "saveError"]) {
      expect(typeof messages.common[cle], `common.${cle} manquante`).toBe("string");
    }
  });
});

describe("aucune action serveur ne renvoie de phrase française", () => {
  /** Chemins des fichiers portant la directive `"use server"`. */
  function actionsServeur(): string[] {
    const trouves: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "__tests__") continue;
          parcourir(chemin);
          continue;
        }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = readFileSync(chemin, "utf-8");
        if (src.slice(0, 200).includes('"use server"')) trouves.push(chemin);
      }
    };
    for (const d of ["app", "lib"]) {
      const chemin = join(process.cwd(), d);
      if (existsSync(chemin)) parcourir(chemin);
    }
    return trouves;
  }

  it("trouve bien les actions serveur", () => {
    // Un contrôle qui n'analyserait aucun fichier passerait aussi.
    expect(actionsServeur().length).toBeGreaterThan(5);
  });

  it("aucun retour `error:` n'est une phrase, seulement un code", () => {
    // Les phrases françaises traversaient l'action jusqu'à une notification,
    // en français pour tout le monde. Un code est traduit à l'affichage.
    //
    // La règle est simple à vérifier : un code est un identifiant, sans espace
    // ni accent. Toute phrase en contient.
    const fautifs: string[] = [];
    for (const p of actionsServeur()) {
      const src = readFileSync(p, "utf-8");
      for (const m of src.matchAll(/error:[ ]*"([^"]{3,})"/g)) {
        // Détection SANS caractère non-ASCII dans la source : une classe du
        // genre `[À-ſ]` ne survit pas à la transformation du test, et le
        // contrôle passait alors sur des phrases bien présentes — vérifié.
        // Une capture qui franchit un saut de ligne n'est pas un message mais
        // un artefact : la classe `[^"]` traverse les retours à la ligne.
        if ([...m[1]].some((c) => c.charCodeAt(0) === 10)) continue;
        const estUnePhrase =
          [...m[1]].some((c) => c === " " || c.charCodeAt(0) > 127);
        if (estUnePhrase) {
          fautifs.push(`  ${p.slice(process.cwd().length + 1)} — "${m[1]}"`);
        }
      }
    }
    expect(
      fautifs,
      fautifs.length
        ? "Phrases renvoyées par une action serveur. Elles s'affichent en " +
          "notification, dans cette langue, quelle que soit celle de la " +
          "personne. Renvoyez un code de `lib/actionErrors.ts` : " +
          fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });

  it("aucune action ne renvoie le message brut de la base", () => {
    // `error: error.message` faisait traverser le message de PostgreSQL
    // jusqu'au navigateur. La couche d'affichage ne le montrait plus, mais la
    // chaîne partait quand même dans la réponse — lisible par qui inspecte le
    // réseau, et citant le nom des tables et des règles.
    //
    // `echecEnregistrement` la journalise côté serveur et ne renvoie qu'un code.
    const fautifs: string[] = [];
    for (const p of actionsServeur()) {
      const src = readFileSync(p, "utf-8");
      for (const m of src.matchAll(/error:[ ]*[\w.?]*\.message/g)) {
        fautifs.push(`  ${p.slice(process.cwd().length + 1)} — ${m[0]}`);
      }
    }
    expect(
      fautifs,
      fautifs.length
        ? "Message brut de la base renvoyé au client. Passez par " +
          "`echecEnregistrement(nomDeLAction, erreur)` : " + fautifs.join(" | ")
        : "",
    ).toEqual([]);
  });
});
