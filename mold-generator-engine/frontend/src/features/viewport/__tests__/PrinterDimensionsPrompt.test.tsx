import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PrinterDimensionsPrompt } from "@/features/viewport/PrinterDimensionsPrompt";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";

function setModelBounds(size: { x: number; y: number; z: number }) {
  useModelBoundsStore.setState({
    groundedWorldBounds: { min: { x: 0, y: 0, z: 0 }, max: size, size },
  });
}

beforeEach(() => {
  usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
  useModelBoundsStore.setState({ groundedWorldBounds: null });
  useSplitFaceStore.getState().clearForModelReplacement();
});

describe("PrinterDimensionsPrompt", () => {
  it("labels its action Enter before a valid printer volume is submitted", () => {
    render(<PrinterDimensionsPrompt />);
    expect(screen.getByRole("button", { name: "Enter" })).toBeInTheDocument();
  });

  it("relabels to Re-enter after a valid submission, and stays editable and resubmittable", async () => {
    const user = userEvent.setup();
    render(<PrinterDimensionsPrompt />);

    await user.type(screen.getByLabelText("Printer X dimension"), "200");
    await user.type(screen.getByLabelText("Printer Y dimension"), "200");
    await user.type(screen.getByLabelText("Printer Z dimension"), "200");
    await user.click(screen.getByRole("button", { name: "Enter" }));

    expect(usePrinterBuildVolumeStore.getState().dimensions).toEqual({ x: 200, y: 200, z: 200 });
    const submit = screen.getByRole("button", { name: "Re-enter" });
    expect(submit).toBeInTheDocument();
    expect(screen.getByLabelText("Printer X dimension")).toBeEnabled();

    await user.clear(screen.getByLabelText("Printer X dimension"));
    await user.type(screen.getByLabelText("Printer X dimension"), "150");
    await user.click(screen.getByRole("button", { name: "Re-enter" }));

    expect(usePrinterBuildVolumeStore.getState().dimensions).toEqual({ x: 150, y: 200, z: 200 });
    expect(screen.getByRole("button", { name: "Re-enter" })).toBeInTheDocument();
  });
});

describe("PrinterDimensionsPrompt model size row", () => {
  it("is absent when no model is imported", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 200, y: 200, z: 200 });

    render(<PrinterDimensionsPrompt />);

    expect(screen.queryByLabelText("Imported model size")).not.toBeInTheDocument();
  });

  it("is absent when the model fits on every axis", () => {
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 200, y: 200, z: 200 });
    setModelBounds({ x: 150, y: 150, z: 150 });

    render(<PrinterDimensionsPrompt />);

    expect(screen.queryByLabelText("Imported model size")).not.toBeInTheDocument();
  });

  it("appears within the same panel (no separate card) and shows read-only dimensions, emphasizing only the exceeded axis", () => {
    // Automatic mold size = model size + 2*AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM
    // (100mm): 1100+200=1300, 180+200=380, 150+200=350. Printer Z is raised
    // to 500 (from 200) so Z specifically stays un-exceeded, preserving this
    // test's "emphasizing only the exceeded axis" mixed X/Y-exceeded,
    // Z-not-exceeded intent under the new floor.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 200, y: 200, z: 500 });
    setModelBounds({ x: 1100, y: 180, z: 150 });

    render(<PrinterDimensionsPrompt />);

    const form = screen.getByLabelText("Printer build volume");
    const row = screen.getByLabelText("Automatic mold size");
    expect(form).toContainElement(row);

    expect(screen.getByLabelText("Mold X dimension")).toHaveTextContent("1300 mm");
    expect(screen.getByLabelText("Mold Y dimension")).toHaveTextContent("380 mm");
    expect(screen.getByLabelText("Mold Z dimension")).toHaveTextContent("350 mm");
    expect(screen.getByLabelText("Mold X dimension").tagName).toBe("OUTPUT");

    expect(screen.getByLabelText("Mold X dimension").className).toContain("modelSizeValueExceeded");
    expect(screen.getByLabelText("Mold Y dimension").className).toContain("modelSizeValueExceeded");
    expect(screen.getByLabelText("Mold Z dimension").className).not.toContain("modelSizeValueExceeded");

    // Read-only: no editable form control for the model dimensions.
    expect(screen.getByLabelText("Mold X dimension").tagName).not.toBe("INPUT");
  });

  it("appears and disappears immediately as the printer volume changes", () => {
    // Automatic mold size = 1100+200=1300, 180+200=380, 150+200=350 (see
    // above). The "after" printer bump must clear all three for the row to
    // disappear.
    usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 200, z: 200 });
    setModelBounds({ x: 1100, y: 180, z: 150 });

    render(<PrinterDimensionsPrompt />);
    expect(screen.getByLabelText("Automatic mold size")).toBeInTheDocument();

    act(() => {
      usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 1500, y: 600, z: 600 });
    });
    expect(screen.queryByLabelText("Automatic mold size")).not.toBeInTheDocument();
  });
});
