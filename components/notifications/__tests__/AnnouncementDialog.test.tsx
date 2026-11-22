import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) => (v?.actor ? `${k}:${v.actor}` : k),
}));
vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
vi.mock("@/components/MarkdownRenderer", () => ({ default: ({ content }: { content: string }) => <div data-testid="md">{content}</div> }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(); }}>{children}</a>
  ),
}));

import { AnnouncementDialog } from "../AnnouncementDialog";
import type { AppNotification } from "@/types/db";

const notif: AppNotification = {
  id: "n1", recipient_id: "u1", type: "world_announcement", world_id: "w1", chat_id: null, message_id: null,
  actor_id: "a1", actor_name: "Thaddeus", persona_id: null, content: "Rentrée",
  metadata: { announcement_id: "a1", world_name: "Ygg", body: "La **saison** reprend." },
  read_at: null, archived_at: null, created_at: "2026-11-22T10:00:00Z", updated_at: "2026-11-22T10:00:00Z",
};

describe("AnnouncementDialog", () => {
  it("montre le monde, le titre, l'auteur et le texte complet", () => {
    render(<AnnouncementDialog notif={notif} worldName={null} open onOpenChange={() => {}} />);
    expect(screen.getByText("Ygg")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Rentrée" })).toBeInTheDocument();
    expect(screen.getByText("announcement.from:Thaddeus")).toBeInTheDocument();
    expect(screen.getByTestId("md")).toHaveTextContent("La **saison** reprend.");
  });

  it("le lien vers le monde ferme le dialogue et le panneau", async () => {
    const onOpenChange = vi.fn();
    const onNavigate = vi.fn();
    render(<AnnouncementDialog notif={notif} worldName="Ygg (à jour)" open onOpenChange={onOpenChange} onNavigate={onNavigate} />);
    expect(screen.getByText("Ygg (à jour)")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "announcement.openWorld" });
    expect(link).toHaveAttribute("href", "/w/w1");
    await userEvent.setup().click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onNavigate).toHaveBeenCalled();
  });
});
