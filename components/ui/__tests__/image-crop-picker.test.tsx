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

import { ImageCropPicker, ImagePickerCropField, getCroppedImg } from "@/components/ui/image-crop-picker";

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

describe("getCroppedImg — format du blob intermédiaire", () => {
  // Ce blob ne quitte jamais le navigateur : `toWebP` le décode et le
  // ré-encode aussitôt en WebP. L'encoder en JPEG cuisait ses artefacts dans
  // l'image AVANT la compression finale — deux générations de perte au lieu
  // d'une, pour un fichier de sortie de taille identique.
  it("encode le recadrage sans perte, en PNG", async () => {
    // jsdom ne charge aucune image et n'a pas de canvas : on simule les deux.
    class ImageStub {
      crossOrigin = "";
      handlers: Record<string, () => void> = {};
      addEventListener(type: string, cb: () => void) { this.handlers[type] = cb; }
      set src(_v: string) { queueMicrotask(() => this.handlers.load?.()); }
    }
    vi.stubGlobal("Image", ImageStub);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    const toBlob = vi.fn((cb: (b: Blob) => void, type?: string) => cb(new Blob([], { type })));
    HTMLCanvasElement.prototype.toBlob = toBlob as unknown as HTMLCanvasElement["toBlob"];

    const blob = await getCroppedImg("blob:x", { x: 0, y: 0, width: 10, height: 10 });

    expect(toBlob.mock.calls[0][1]).toBe("image/png");
    expect(blob.type).toBe("image/png");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("ImagePickerCropField — échec de l'envoi", () => {
  // Régression : l'envoi de l'image d'une catégorie échouait avant la première
  // requête, le recadrage se refermait sur une case vide et le formulaire
  // s'enregistrait ensuite sans image. Le parent lève désormais depuis
  // onConfirm ; le sélecteur doit alors rester sur le recadrage et le dire.
  function stubCanvas() {
    class ImageStub {
      crossOrigin = "";
      handlers: Record<string, () => void> = {};
      addEventListener(type: string, cb: () => void) { this.handlers[type] = cb; }
      set src(_v: string) { queueMicrotask(() => this.handlers.load?.()); }
    }
    vi.stubGlobal("Image", ImageStub);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    HTMLCanvasElement.prototype.toBlob = ((cb: (b: Blob) => void, type?: string) =>
      cb(new Blob([], { type }))) as unknown as HTMLCanvasElement["toBlob"];
  }

  async function pickFile(user: ReturnType<typeof userEvent.setup>) {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: vi.fn() });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["x"], "a.png", { type: "image/png" }));
  }

  it("garde le recadrage ouvert et affiche un message quand onConfirm lève", async () => {
    stubCanvas();
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("upload failed"));
    render(<ImagePickerCropField aspect={1} onConfirm={onConfirm} />);

    await pickFile(user);
    await user.click(await screen.findByRole("button", { name: /recadrer/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Envoi impossible. Réessayez dans un instant.")).toBeInTheDocument();
    expect(screen.getByTestId("cropper-stub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recadrer/i })).toBeInTheDocument();
  });

  it("referme le recadrage quand onConfirm résout", async () => {
    stubCanvas();
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ImagePickerCropField aspect={1} onConfirm={onConfirm} previewSrc="https://x/prev.png" />);

    // previewSrc présent : on est en aperçu ; cliquer dessus rouvre la sélection.
    await user.click(screen.getByRole("button"));
    await pickFile(user);
    await user.click(await screen.findByRole("button", { name: /recadrer/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("cropper-stub")).not.toBeInTheDocument();
    expect(screen.queryByText("Envoi impossible. Réessayez dans un instant.")).not.toBeInTheDocument();
  });
});
