import { describe, it, expect } from "vitest";
import { chatIdFromPathname } from "@/lib/requestPath";

describe("chatIdFromPathname", () => {
  it("extrait l'id d'un chemin de salon", () => {
    expect(chatIdFromPathname("/c/abc-123")).toBe("abc-123");
    expect(chatIdFromPathname("/c/abc-123/autre")).toBe("abc-123");
  });

  it("rend null hors des salons ou sans chemin", () => {
    expect(chatIdFromPathname("/w/abc")).toBeNull();
    expect(chatIdFromPathname("/c")).toBeNull();
    expect(chatIdFromPathname(null)).toBeNull();
  });
});
