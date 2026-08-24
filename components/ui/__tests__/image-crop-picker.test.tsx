import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Area } from "react-easy-crop";

// Stub minimal : simule un recadrage déjà effectué dès le montage, pour que
// le bouton de confirmation soit activable sans piloter le vrai composant
// de recadrage (canvas non disponible sous jsdom).
function CropperStub({ onCropComplete }: { onCropComplete: (area: Area, pixels: Area) => void }) {
  const pixels: Area = { x: 0, y: 0, width: 10, height: 10 };
  useEffect(() => {
    onCropComplete(pixels, pixels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div data-testid="cropper-stub" />;
}

vi.mock("react-easy-crop", () => ({ default: CropperStub }));

import { ImageCropPicker } from "@/components/ui/image-crop-picker";

describe("ImageCropPicker — pas de soumission accidentelle du formulaire englobant", () => {
  it("confirmer le recadrage n'appelle pas onSubmit du <form> parent", async () => {
    const onConfirm = vi.fn();
    const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();

    render(
      <form onSubmit={onFormSubmit}>
        <ImageCropPicker src="blob:fake" aspect={1} onConfirm={onConfirm} onCancel={vi.fn()} />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: /recadrer/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it("« Autre image » n'appelle pas non plus onSubmit du <form> parent", async () => {
    const onCancel = vi.fn();
    const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();

    render(
      <form onSubmit={onFormSubmit}>
        <ImageCropPicker src="blob:fake" aspect={1} onConfirm={vi.fn()} onCancel={onCancel} />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: /autre image/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFormSubmit).not.toHaveBeenCalled();
  });
});
