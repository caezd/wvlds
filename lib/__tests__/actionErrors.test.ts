import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

describe("les actions de réglages ne renvoient plus de français", () => {
  it("aucune phrase française ne subsiste dans leurs retours d'erreur", () => {
    // Contrôle de non-régression sur la tranche convertie. Les autres actions
    // serveur — mesurées à 21 messages restants — ne sont pas encore traitées.
    const src = readFileSync(
      join(process.cwd(), "app", "(protected)", "settings", "actions.ts"),
      "utf-8",
    );
    const litteraux = [...src.matchAll(/\berror:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(litteraux, `retours en dur : ${litteraux.join(", ")}`).toEqual([]);
  });

  it("chaque retour d'erreur passe par une constante", () => {
    const src = readFileSync(
      join(process.cwd(), "app", "(protected)", "settings", "actions.ts"),
      "utf-8",
    );
    const retours = [...src.matchAll(/\berror:\s*(\w+)\s*\}/g)].map((m) => m[1]);
    expect(retours.length).toBeGreaterThan(5);
    for (const r of retours) {
      expect(r, `retour inattendu : ${r}`).toMatch(/^ERR_/);
    }
  });
});
