import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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

  function interpolate(tpl: string, vals: Record<string, unknown>): string {
    return tpl.replace(/\{(\w+)(?:,[^}]*)?\}/g, (_, k: string) => {
      const v = vals[k];
      return v !== undefined && typeof v !== "function" ? String(v) : `{${k}}`;
    });
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
      parts.push(typeof fn === "function" ? (fn as (c: unknown) => unknown)(inner) : inner);
      last = m.index + m[0].length;
    }
    const tail = tpl.slice(last);
    if (tail) parts.push(interpolate(tail, vals));
    return parts.length === 1 ? parts[0] : parts;
  }

  function makeT(namespace?: string) {
    const ns = (namespace ? frMsgs[namespace] : frMsgs) ?? {};
    const msgs = ns as Record<string, unknown>;

    function t(key: string, values?: Record<string, unknown>): string {
      const raw = getNested(msgs, key);
      if (typeof raw !== "string") return key;
      return values ? interpolate(raw, values) : raw;
    }
    t.rich = (key: string, values?: Record<string, unknown>) => {
      const raw = getNested(msgs, key);
      if (typeof raw !== "string") return key;
      return renderRich(raw, values ?? {});
    };
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
