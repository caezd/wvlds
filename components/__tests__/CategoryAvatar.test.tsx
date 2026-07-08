import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CategoryAvatar } from "@/components/worlds/CategoryAvatar";

describe("CategoryAvatar", () => {
  it("priorise l'image de catégorie (icon_url) sur la bannière", () => {
    const { container } = render(
      <CategoryAvatar
        title="Annonces"
        bannerUrl="https://example.com/banner.webp"
        iconUrl="https://example.com/icon.webp"
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.webp");
  });

  it("retombe sur la bannière en l'absence d'image de catégorie", () => {
    const { container } = render(
      <CategoryAvatar title="Annonces" bannerUrl="https://example.com/banner.webp" iconUrl={null} />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/banner.webp");
  });

  it("retombe sur l'initiale du titre sans bannière ni image de catégorie", () => {
    const { container } = render(<CategoryAvatar title="Annonces" bannerUrl={null} iconUrl={null} />);
    expect(container.textContent).toBe("A");
    expect(container.querySelector("img")).toBeNull();
  });
});
