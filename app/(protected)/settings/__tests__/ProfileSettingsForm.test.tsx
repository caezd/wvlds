import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "bioHint") return `${values?.count}/500 characters`;
    return key;
  },
}));

const updateProfileBioAndPronouns = vi.fn();
vi.mock("../actions", () => ({
  updateProfileBioAndPronouns: (...args: unknown[]) => updateProfileBioAndPronouns(...args),
}));

import { ProfileSettingsForm } from "../ProfileSettingsForm";

describe("ProfileSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProfileBioAndPronouns.mockResolvedValue({ success: true });
  });

  it("pré-remplit la bio et les pronoms existants", () => {
    render(<ProfileSettingsForm initialBio="Salut !" initialPronouns={["he_him", "Mon pronom"]} />);

    expect(screen.getByDisplayValue("Salut !")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "he_him" })).toHaveClass("text-primary");
    expect(screen.getByDisplayValue("Mon pronom")).toBeInTheDocument();
  });

  it("bascule une option de pronom au clic", () => {
    render(<ProfileSettingsForm initialBio="" initialPronouns={[]} />);

    const option = screen.getByRole("button", { name: "she_her" });
    expect(option).not.toHaveClass("text-primary");

    fireEvent.click(option);
    expect(option).toHaveClass("text-primary");

    fireEvent.click(option);
    expect(option).not.toHaveClass("text-primary");
  });

  it("empêche de sélectionner plus de PRONOUNS_MAX_COUNT pronoms", () => {
    render(<ProfileSettingsForm initialBio="" initialPronouns={["he_him", "she_her", "they_them"]} />);

    const fourth = screen.getByRole("button", { name: "any" });
    expect(fourth).toBeDisabled();

    fireEvent.click(fourth);
    expect(fourth).not.toHaveClass("text-primary");
  });

  it("envoie la bio et les pronoms sélectionnés à la sauvegarde", async () => {
    render(<ProfileSettingsForm initialBio="" initialPronouns={[]} />);

    fireEvent.change(screen.getByPlaceholderText("bioPlaceholder"), {
      target: { value: "Une bio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "they_them" }));
    fireEvent.change(screen.getByPlaceholderText("pronounsCustomPlaceholder"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await vi.waitFor(() => {
      expect(updateProfileBioAndPronouns).toHaveBeenCalledWith("Une bio", ["they_them", "custom"]);
    });
  });
});
