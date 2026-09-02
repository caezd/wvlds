"use client";

import { useEffect } from "react";

import {
  CLIENT_ERROR_MESSAGE_MAX,
  enregistrerErreurClient,
  type ClientErrorKind,
} from "@/lib/clientErrorLog";

/**
 * Bruit du serveur de développement, à ne pas confondre avec un défaut de
 * l'application. Le journal sert à comprendre un signalement : le remplir de
 * messages d'outillage le rendrait illisible là où il compte.
 */
const BRUIT = /\[Fast Refresh\]|Download the React DevTools|was preloaded using link preload/i;

/** Ce qu'une console reçoit et qui n'a rien d'une erreur exploitable. */
function estExploitable(message: string): boolean {
  return message.trim().length > 0 && !BRUIT.test(message);
}

function enTexte(valeur: unknown): string {
  if (typeof valeur === "string") return valeur;
  try {
    return JSON.stringify(valeur) ?? String(valeur);
  } catch {
    return String(valeur);
  }
}

/**
 * Applique les directives de format de la console au premier argument.
 *
 * `console.error` n'est pas une simple concaténation : React et Next
 * journalisent sous la forme `console.error("%c%s%c ...", css, préfixe, css)`.
 * Coller les arguments bout à bout donnait des lignes comme
 * « %c%s%c background: #e6e6e6;… Server MISSING_MESSAGE: … » — le style de la
 * console noyant le seul texte qui compte.
 *
 * `%c` consomme son argument et n'affiche rien : c'est du style, pas du
 * contenu. Les autres directives substituent le leur. Ce qui reste après la
 * dernière est rendu tel quel, comme le ferait une console.
 */
function appliquerDirectives(args: unknown[]): unknown[] {
  const [premier, ...reste] = args;
  if (typeof premier !== "string" || !/%[csdifoO]/.test(premier)) return args;

  const restants = [...reste];
  const texte = premier.replace(/%([%csdifoO])/g, (entier, directive: string) => {
    if (directive === "%") return "%";
    if (restants.length === 0) return entier;
    const valeur = restants.shift();
    switch (directive) {
      case "c":
        return "";
      case "d":
      case "i":
        return String(Math.trunc(Number(valeur)));
      case "f":
        return String(Number(valeur));
      default:
        return enTexte(valeur);
    }
  });

  return [texte.trim(), ...restants];
}

/**
 * Met bout à bout ce qui a été passé à `console.error`.
 *
 * Une `Error` y perd tout si on la stringifie naïvement — « [object Object] »
 * pour un objet, « Error » pour une erreur. On en tire donc message et pile.
 */
function decrire(args: unknown[]): { message: string; stack?: string } {
  let stack: string | undefined;
  const morceaux = appliquerDirectives(args).map((arg) => {
    if (arg instanceof Error) {
      stack ??= arg.stack;
      return arg.message;
    }
    return enTexte(arg);
  });
  return { message: morceaux.join(" ").trim().slice(0, CLIENT_ERROR_MESSAGE_MAX), stack };
}

/**
 * `console.error` n'est remplacée qu'une fois pour toute la page.
 *
 * En développement, React monte deux fois chaque effet : sans ce garde, la
 * seconde installation envelopperait la première et chaque erreur serait
 * journalisée en double.
 */
let consoleDetournee = false;

/**
 * Cadres qui appartiennent au framework et non à l'application.
 *
 * Volontairement basé sur les BIBLIOTHÈQUES et non sur `.next` : le chemin le
 * plus utile d'une erreur de rendu ressemble à
 * `SidebarRail@about://React/Server/…/.next/server/chunks/…`, et écarter tout
 * ce qui contient `.next` jetterait justement la ligne qu'on cherche.
 */
const CADRE_FRAMEWORK =
  /react-server-dom|react-dom|react-refresh|next_dist_|\/node_modules\/|scheduler\.|@swc\//i;

/** Au-delà, on ne lit plus : les premiers cadres portent l'information. */
const CADRES_GARDES = 12;

const estCadre = (ligne: string) => ligne.includes("@") || /^\s*at\s/.test(ligne);

/**
 * Retire de la pile les cadres internes du framework.
 *
 * Une erreur de rendu produit une vingtaine de lignes de `parseModelString`,
 * `initializeModelChunk` et consorts pour un seul cadre applicatif. Le journal
 * sert à comprendre un signalement : noyer la ligne utile sous la mécanique de
 * React revient à ne rien journaliser.
 *
 * Une pile entièrement composée de cadres internes est gardée telle quelle —
 * une pile illisible reste plus utile que pas de pile du tout.
 */
function nettoyerPile(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const lignes = stack.split("\n");
  const gardées = lignes.filter((l) => !estCadre(l) || !CADRE_FRAMEWORK.test(l));
  const utiles = gardées.some(estCadre) ? gardées : lignes;
  return utiles.slice(0, CADRES_GARDES).join("\n");
}

function noter(kind: ClientErrorKind, message: string, extra?: { source?: string; stack?: string }) {
  if (!estExploitable(message)) return;
  enregistrerErreurClient({
    at: new Date().toISOString(),
    kind,
    message,
    ...extra,
    stack: nettoyerPile(extra?.stack),
  });
}

/**
 * Retient les dernières erreurs du navigateur, pour qu'un signalement puisse
 * les emporter.
 *
 * Monté à la racine, donc au-dessus des pages d'authentification comme du
 * groupe protégé : une erreur qui empêche de se connecter est précisément
 * celle qu'on ne saurait pas décrire autrement.
 *
 * Trois sources, parce qu'aucune ne suffit seule :
 *  - `error` sur `window` : les erreurs non rattrapées du code de la page ;
 *  - `unhandledrejection` : les promesses rejetées sans `catch`, invisibles de
 *    la première ;
 *  - `console.error` : ce que React et Next y déposent, y compris les deux
 *    frontières d'erreur de l'application — c'est là, et nulle part ailleurs,
 *    que le message d'origine d'une erreur de rendu reste lisible.
 */
export function ClientErrorRecorder() {
  useEffect(() => {
    function surErreur(e: ErrorEvent) {
      const source = e.filename ? `${e.filename}:${e.lineno ?? 0}` : undefined;
      noter("uncaught", e.message, { source, stack: e.error?.stack });
    }

    function surRejet(e: PromiseRejectionEvent) {
      const raison = e.reason;
      if (raison instanceof Error) noter("rejection", raison.message, { stack: raison.stack });
      else noter("rejection", typeof raison === "string" ? raison : String(raison));
    }

    window.addEventListener("error", surErreur);
    window.addEventListener("unhandledrejection", surRejet);

    const originale = console.error;
    if (!consoleDetournee) {
      consoleDetournee = true;
      console.error = (...args: unknown[]) => {
        // La console d'abord : le journal ne doit jamais coûter à quelqu'un le
        // message qu'il attendait, quoi qu'il advienne ensuite.
        originale(...args);
        try {
          const { message, stack } = decrire(args);
          noter("console", message, { stack });
        } catch {
          // Une erreur ici passerait par `console.error` : on s'arrête net
          // plutôt que de tourner en rond.
        }
      };
    }

    return () => {
      window.removeEventListener("error", surErreur);
      window.removeEventListener("unhandledrejection", surRejet);
      if (console.error !== originale) {
        console.error = originale;
        consoleDetournee = false;
      }
    };
  }, []);

  return null;
}
