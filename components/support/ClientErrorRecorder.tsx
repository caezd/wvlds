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

/**
 * Met bout à bout ce qui a été passé à `console.error`.
 *
 * Une `Error` y perd tout si on la stringifie naïvement — « [object Object] »
 * pour un objet, « Error » pour une erreur. On en tire donc message et pile.
 */
function decrire(args: unknown[]): { message: string; stack?: string } {
  let stack: string | undefined;
  const morceaux = args.map((arg) => {
    if (arg instanceof Error) {
      stack ??= arg.stack;
      return arg.message;
    }
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  return { message: morceaux.join(" ").slice(0, CLIENT_ERROR_MESSAGE_MAX), stack };
}

/**
 * `console.error` n'est remplacée qu'une fois pour toute la page.
 *
 * En développement, React monte deux fois chaque effet : sans ce garde, la
 * seconde installation envelopperait la première et chaque erreur serait
 * journalisée en double.
 */
let consoleDetournee = false;

function noter(kind: ClientErrorKind, message: string, extra?: { source?: string; stack?: string }) {
  if (!estExploitable(message)) return;
  enregistrerErreurClient({ at: new Date().toISOString(), kind, message, ...extra });
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
