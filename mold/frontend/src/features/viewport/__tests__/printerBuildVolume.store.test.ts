import {
  parsePrinterBuildVolume,
  usePrinterBuildVolumeStore,
} from "@/features/viewport/printerBuildVolume.store";

describe("printer build volume", () => {
  it("accepts finite positive millimeter dimensions", () => {
    expect(
      parsePrinterBuildVolume({ x: "220", y: "220.5", z: "250" }),
    ).toEqual({
      ok: true,
      dimensions: { x: 220, y: 220.5, z: 250 },
    });
  });

  it.each([
    { x: "", y: "220", z: "250" },
    { x: "0", y: "220", z: "250" },
    { x: "-1", y: "220", z: "250" },
    { x: "Infinity", y: "220", z: "250" },
  ])("rejects incomplete or non-positive dimensions: %o", (draft) => {
    expect(parsePrinterBuildVolume(draft)).toEqual({ ok: false });
  });

  it("keeps accepted dimensions in frontend state until reset", () => {
    usePrinterBuildVolumeStore
      .getState()
      .setPrinterBuildVolume({ x: 180, y: 180, z: 200 });

    expect(usePrinterBuildVolumeStore.getState().dimensions).toEqual({
      x: 180,
      y: 180,
      z: 200,
    });

    usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();

    expect(usePrinterBuildVolumeStore.getState().dimensions).toBeNull();
  });
});

