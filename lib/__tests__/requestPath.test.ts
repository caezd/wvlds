import { describe, it, expect } from "vitest";
import { chatIdFromPathname, worldIdFromPathname } from "@/lib/requestPath";

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

describe("worldIdFromPathname", () => {
  it("extrait l'id d'un chemin de monde", () => {
    expect(worldIdFromPathname("/w/monde-1")).toBe("monde-1");
    expect(worldIdFromPathname("/w/monde-1/autre")).toBe("monde-1");
  });

  it("rend null hors des mondes ou sans chemin", () => {
    expect(worldIdFromPathname("/c/abc")).toBeNull();
    expect(worldIdFromPathname("/w")).toBeNull();
    expect(worldIdFromPathname(undefined)).toBeNull();
  });
});
