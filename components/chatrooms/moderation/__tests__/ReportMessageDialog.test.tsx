import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const reportMessage = vi.fn();
vi.mock("@/lib/messageReports", () => ({
  REPORT_REASON_MAX: 500,
  reportMessage: (...a: unknown[]) => reportMessage(...a),
}));

import { ReportMessageDialog } from "../ReportMessageDialog";

beforeEach(() => {
  reportMessage.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});

describe("ReportMessageDialog", () => {
  it("envoie la raison saisie puis se ferme", async () => {
    reportMessage.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<ReportMessageDialog messageId={42} onClose={onClose} />);

    const envoyer = screen.getByRole("button", { name: "reportSubmit" });
    expect(envoyer).toBeDisabled(); // raison obligatoire
    fireEvent.change(screen.getByLabelText("reportPlaceholder"), { target: { value: "spam" } });
    fireEvent.click(envoyer);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(reportMessage).toHaveBeenCalledWith(expect.anything(), 42, "spam");
    expect(toast.success).toHaveBeenCalledWith("reportSent");
  });

  it("double signalement : prévient sans erreur", async () => {
    reportMessage.mockResolvedValue({ ok: false, reason: "duplicate" });
    render(<ReportMessageDialog messageId={42} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("reportPlaceholder"), { target: { value: "spam" } });
    fireEvent.click(screen.getByRole("button", { name: "reportSubmit" }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("reportDuplicate"));
  });

  it("fermée quand aucun message n'est désigné", () => {
    render(<ReportMessageDialog messageId={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "reportSubmit" })).toBeNull();
  });
});
