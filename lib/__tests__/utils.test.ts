import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, isSafeUrl, formatLastSeen } from "@/lib/utils";

describe("cn", () => {
  it("fusionne les classes et résout les conflits tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", false && "hidden", "font-bold")).toBe(
      "text-red-500 font-bold",
    );
  });
});

describe("isSafeUrl", () => {
  it("accepte http et https", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("http://example.com/path?x=1")).toBe(true);
  });

  it("rejette les protocoles dangereux", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejette null, undefined et chaîne vide", () => {
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });

  it("rejette une URL malformée", () => {
    expect(isSafeUrl("pas une url")).toBe(false);
  });
});

describe("formatLastSeen", () => {
  afterEach(() => vi.useRealTimers());

  it('retourne "à l\'instant" pour moins d\'une minute', () => {
    const now = new Date("2026-06-20T12:00:00Z");
    vi.useFakeTimers().setSystemTime(now);
    expect(formatLastSeen(new Date(now.getTime() - 30_000))).toBe("à l'instant");
  });

  it("affiche les minutes écoulées", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    vi.useFakeTimers().setSystemTime(now);
    expect(formatLastSeen(new Date(now.getTime() - 5 * 60_000))).toBe("il y a 5 min");
  });

  it("affiche les heures écoulées", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    vi.useFakeTimers().setSystemTime(now);
    expect(formatLastSeen(new Date(now.getTime() - 3 * 3_600_000))).toBe("il y a 3 h");
  });

  it("retourne une chaîne vide pour une date invalide", () => {
    expect(formatLastSeen("pas-une-date")).toBe("");
  });
});
