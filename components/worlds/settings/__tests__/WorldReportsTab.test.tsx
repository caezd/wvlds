import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/date-display", () => ({ default: () => <span>date</span> }));
const fetchOpenReports = vi.fn();
const resolveReport = vi.fn();
vi.mock("@/lib/messageReports", () => ({
  fetchOpenReports: (...a: unknown[]) => fetchOpenReports(...a),
  resolveReport: (...a: unknown[]) => resolveReport(...a),
}));
vi.mock("@/components/ui/delete-confirm-dialog", () => ({
  DeleteConfirmDialog: ({ open, onConfirm }: { open?: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>confirmer</button> : null,
}));

import { WorldReportsTab } from "../WorldReportsTab";

const rapport = (id: string, message_id: number | null) => ({
  id, message_id, chat_id: "c1", reason: "spam", created_at: "t",
  reporter: { username: "bob" }, message_author: { username: "eve" }, chat: { title: "Taverne", name: null },
  content: message_id ? "Achetez !" : null, persona_name: null,
});

beforeEach(() => {
  fetchOpenReports.mockReset();
  resolveReport.mockReset().mockResolvedValue({ ok: true });
});

describe("WorldReportsTab", () => {
  it("affiche la file et classe un signalement", async () => {
    fetchOpenReports.mockResolvedValue([rapport("r1", 5), rapport("r2", 6)]);
    render(<WorldReportsTab worldId="w1" />);
    await waitFor(() => expect(screen.getAllByTestId("report-item")).toHaveLength(2));
    expect(screen.getAllByText("Achetez !")).toHaveLength(2);

    fireEvent.click(screen.getAllByText("reportsDismiss")[0]);
    await waitFor(() => expect(screen.getAllByTestId("report-item")).toHaveLength(1));
    expect(resolveReport).toHaveBeenCalledWith(expect.anything(), "r1", "dismiss");
  });

  it("supprimer demande confirmation et règle les signalements du même message", async () => {
    fetchOpenReports.mockResolvedValue([rapport("r1", 5), rapport("r2", 5), rapport("r3", 9)]);
    render(<WorldReportsTab worldId="w1" />);
    await waitFor(() => expect(screen.getAllByTestId("report-item")).toHaveLength(3));

    fireEvent.click(screen.getAllByText("reportsDelete")[0]);
    expect(resolveReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("confirmer"));

    await waitFor(() => expect(screen.getAllByTestId("report-item")).toHaveLength(1));
    expect(resolveReport).toHaveBeenCalledWith(expect.anything(), "r1", "delete");
  });

  it("file vide", async () => {
    fetchOpenReports.mockResolvedValue([]);
    render(<WorldReportsTab worldId="w1" />);
    expect(await screen.findByTestId("reports-empty")).toBeInTheDocument();
  });
});
