import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";

import { createModelSelectionHighlight } from "@/features/viewport/runtime/modelSelectionHighlight";

const DARK_PALETTE = {
  background: "#0b1118",
  gridMajor: "#303943",
  gridMinor: "#46525f",
};

it("applies selection material and restores the original material", () => {
  const geometry = new SphereGeometry(1);
  const originalMaterial = new MeshStandardMaterial({ color: 0xb8e3ec });
  const mesh = new Mesh(geometry, originalMaterial);
  const highlight = createModelSelectionHighlight();

  highlight.apply(mesh, DARK_PALETTE);

  const selectedMaterial = mesh.material;
  expect(selectedMaterial).not.toBe(originalMaterial);
  expect(highlight.isAppliedTo(mesh)).toBe(true);

  highlight.clear();

  expect(mesh.material).toBe(originalMaterial);
});

it("does not create duplicate material clones for the same target", () => {
  const mesh = new Mesh(
    new SphereGeometry(1),
    new MeshStandardMaterial({ color: 0xb8e3ec }),
  );
  const highlight = createModelSelectionHighlight();

  highlight.apply(mesh, DARK_PALETTE);
  const selectedMaterial = mesh.material;
  highlight.apply(mesh, DARK_PALETTE);

  expect(mesh.material).toBe(selectedMaterial);
});

it("disposes owned selection clones without disposing the original material", () => {
  const originalMaterial = new MeshStandardMaterial({ color: 0xb8e3ec });
  const mesh = new Mesh(new SphereGeometry(1), originalMaterial);
  const highlight = createModelSelectionHighlight();
  const disposeOriginal = vi.spyOn(originalMaterial, "dispose");

  highlight.apply(mesh, DARK_PALETTE);
  const selectedMaterial = mesh.material as MeshStandardMaterial;
  const disposeSelection = vi.spyOn(selectedMaterial, "dispose");

  highlight.dispose();

  expect(disposeSelection).toHaveBeenCalledTimes(1);
  expect(disposeOriginal).not.toHaveBeenCalled();
  expect(mesh.material).toBe(originalMaterial);
});
it("hides and restores only the selection box without clearing the model highlight", () => {
  const originalMaterial = new MeshStandardMaterial({
    color: 0xb8e3ec,
  });
  const mesh = new Mesh(
    new SphereGeometry(1),
    originalMaterial,
  );
  const highlight = createModelSelectionHighlight();

  highlight.apply(mesh, DARK_PALETTE);

  const selectedMaterial = mesh.material;
  const selectionBoxObject = mesh.children[0];

  expect(selectionBoxObject).toBeDefined();
  expect(selectionBoxObject?.visible).toBe(true);

  expect(highlight.setSelectionBoxVisible(false)).toBe(true);

  expect(selectionBoxObject?.visible).toBe(false);
  expect(mesh.material).toBe(selectedMaterial);
  expect(highlight.isAppliedTo(mesh)).toBe(true);
  expect(highlight.getSelectionBoxBounds()).not.toBeNull();
  expect(highlight.setSelectionBoxVisible(false)).toBe(false);

  expect(highlight.setSelectionBoxVisible(true)).toBe(true);

  expect(selectionBoxObject?.visible).toBe(true);
  expect(mesh.material).toBe(selectedMaterial);
  expect(highlight.isAppliedTo(mesh)).toBe(true);
});