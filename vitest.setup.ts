import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { cloneElement, isValidElement } from "react";

// ── Mock next-intl ──────────────────────────────────────────────────────────────
// Fournit useTranslations() backed par les vraies traductions fr.json, sans avoir
// besoin de NextIntlClientProvider dans les tests.
vi.mock("next-intl", async () => {
  const frMsgs = ((await import("@/messages/fr.json")) as { default: Record<string, unknown> }).default;

  function getNested(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  }

  // Le format ICU, tel que next-intl le lit : `{nom}`, et les blocs
  // `{n, plural, one {…} other {…}}` et `{g, select, …}`, imbriqués au besoin.
  //
  // Le mock ne remplaçait que `{nom}` jusqu'à la première accolade fermante :
  // un pluriel sortait en « 2 other {# mois}} », et un test ne pouvait vérifier
  // l'accord d'aucun des messages qui en portent. Les règles de pluriel sont
  // celles du français (0 et 1 au singulier), comme à l'écran.
  const reglesPluriel = new Intl.PluralRules("fr");

  /** L'accolade fermante qui répond à celle placée en `debut`. */
  function fermeture(tpl: string, debut: number): number {
    let profondeur = 0;
    for (let i = debut; i < tpl.length; i++) {
      if (tpl[i] === "{") profondeur++;
      else if (tpl[i] === "}" && --profondeur === 0) return i;
    }
    return -1;
  }

  /** Les branches `clé {texte}` d'un bloc plural/select. */
  function branches(corps: string): Map<string, string> {
    const out = new Map<string, string>();
    let i = 0;
    while (i < corps.length) {
      const ouverture = corps.indexOf("{", i);
      if (ouverture === -1) break;
      const cle = corps.slice(i, ouverture).trim();
      const fin = fermeture(corps, ouverture);
      if (fin === -1) break;
      out.set(cle, corps.slice(ouverture + 1, fin));
      i = fin + 1;
    }
    return out;
  }

  function interpolate(tpl: string, vals: Record<string, unknown>, diese?: string): string {
    let out = "";
    let i = 0;
    while (i < tpl.length) {
      const c = tpl[i];
      if (c === "#" && diese !== undefined) { out += diese; i++; continue; }
      if (c !== "{") { out += c; i++; continue; }
      const fin = fermeture(tpl, i);
      if (fin === -1) { out += tpl.slice(i); break; }
      const bloc = tpl.slice(i + 1, fin);
      const [nom, genre, ...reste] = bloc.split(",");
      const cle = nom.trim();
      const valeur = vals[cle];
      const type = genre?.trim();
      if (type === "plural" || type === "select") {
        const choix = branches(reste.join(","));
        let texte: string | undefined;
        if (type === "plural") {
          const n = Number(valeur);
          texte = choix.get(`=${n}`) ?? choix.get(reglesPluriel.select(n)) ?? choix.get("other");
          out += interpolate(texte ?? "", vals, String(n));
        } else {
          texte = choix.get(String(valeur)) ?? choix.get("other");
          out += interpolate(texte ?? "", vals, diese);
        }
      } else {
        out += valeur !== undefined && typeof valeur !== "function" ? String(valeur) : `{${cle}}`;
      }
      i = fin + 1;
    }
    return out;
  }

  function renderRich(tpl: string, vals: Record<string, unknown>): unknown {
    const parts: unknown[] = [];
    // [\s\S] plutôt que le flag `s` (indisponible avec la target TS du projet)
    const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(tpl)) !== null) {
      const before = tpl.slice(last, m.index);
      if (before) parts.push(interpolate(before, vals));
      const fn = vals[m[1]];
      const inner = interpolate(m[2], vals);
      const rendered = typeof fn === "function" ? (fn as (c: unknown) => unknown)(inner) : inner;
      // Le vrai next-intl clé ses fragments riches en interne ; ce mock doit
      // faire pareil pour ne pas déclencher le warning React "unique key"
      // dès qu'un template mélange texte brut et éléments (ex. <b>...</b>).
      parts.push(isValidElement(rendered) ? cloneElement(rendered, { key: parts.length }) : rendered);
      last = m.index + m[0].length;
    }
    const tail = tpl.slice(last);
    if (tail) parts.push(interpolate(tail, vals));
    return parts.length === 1 ? parts[0] : parts;
  }

  function makeT(namespace?: string) {
    // Le namespace peut être imbriqué (ex. "settings.profile") — même résolution
    // par point que pour les clés.
    const ns = (namespace ? getNested(frMsgs, namespace) : frMsgs) ?? {};
    const msgs = ns as Record<string, unknown>;

    // Une clé absente LÈVE, comme le vrai next-intl (MISSING_MESSAGE).
    //
    // Ce mock rendait auparavant la clé elle-même, en silence. Un composant
    // qui demandait une traduction jamais écrite passait donc tous ses tests,
    // et n'échouait qu'à l'écran — c'est arrivé sur le panneau d'annotations
    // du wiki, dont deux libellés de dialogue manquaient aux trois locales
    // sans qu'aucun des 2 000 tests ne bronche. Rendre l'absence bruyante ici
    // la fait remonter au premier test qui rend le composant.
    function exiger(key: string): string {
      const raw = getNested(msgs, key);
      if (typeof raw !== "string") {
        throw new Error(
          `MISSING_MESSAGE: ${namespace ? `${namespace}.${key}` : key} absente de messages/fr.json`,
        );
      }
      return raw;
    }

    function t(key: string, values?: Record<string, unknown>): string {
      const raw = exiger(key);
      return values ? interpolate(raw, values) : raw;
    }
    t.rich = (key: string, values?: Record<string, unknown>) =>
      renderRich(exiger(key), values ?? {});
    t.raw = (key: string) => getNested(msgs, key);
    t.has = (key: string) => getNested(msgs, key) !== undefined;
    t.markup = (key: string, values?: Record<string, unknown>) => t(key, values);
    return t;
  }

  return {
    useTranslations: (ns?: string) => makeT(ns),
    getTranslations: async (ns?: string) => makeT(ns),
    useLocale: () => "fr",
    useFormatter: () => ({
      dateTime: (d: Date) => d.toLocaleDateString("fr"),
      number: (n: number) => n.toString(),
    }),
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});

// Démonte le DOM après chaque test pour éviter les fuites entre tests.
afterEach(() => {
  cleanup();
});

// matchMedia n'existe pas sous jsdom — stub minimal pour les composants qui l'utilisent.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// ResizeObserver est utilisé par Radix / certains composants — stub no-op.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// IntersectionObserver est utilisé pour l'infinite scroll — stub no-op.
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
}

// Radix Select/Dropdown s'appuient sur des API DOM absentes de jsdom :
// scrollIntoView et la capture de pointeur. Stubs no-op pour pouvoir piloter
// ces composants dans les tests (ouvrir le menu, cliquer une option).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
