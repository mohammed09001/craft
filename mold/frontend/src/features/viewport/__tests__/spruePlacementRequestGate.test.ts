import {
  designSprueProfile,
  type SpruePreviewPlacement,
  type ValidSpruePreviewPlacement,
} from "@/features/mold-generation/sprue-generation";
import { createSpruePlacementRequestGate } from "@/features/viewport/runtime/spruePlacementRequestGate";

const placement: ValidSpruePreviewPlacement = {
  status: "valid",
  topPoint: { x: 5, y: 5, z: 10 },
  cavityPoint: { x: 5, y: 5, z: 4 },
  inwardDirection: { x: 0, y: 0, z: -1 },
  stemLengthMm: 6,
  profileDesign: designSprueProfile(null),
  coordinateSpace: "mold-local",
};

it("snapshots one request, rejects duplicates while busy, and unlocks after success", async () => {
  let release: ((created: boolean) => void) | undefined;
  const create = vi.fn(
    (acceptedPlacement: SpruePreviewPlacement) => {
      void acceptedPlacement;
      return new Promise<boolean>((resolve) => { release = resolve; });
    },
  );
  const onCreated = vi.fn();
  const gate = createSpruePlacementRequestGate({ create, onCreated });

  expect(gate.request(placement)).toBe(true);
  expect(gate.isBusy()).toBe(true);
  expect(gate.request({ ...placement, topPoint: { x: 6, y: 5, z: 10 } })).toBe(false);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(placement);
  const accepted = create.mock.calls[0]![0];
  expect(Object.isFrozen(accepted)).toBe(true);
  expect(Object.isFrozen(accepted.topPoint)).toBe(true);
  expect(accepted.status).toBe("valid");
  if (accepted.status === "valid") expect(Object.isFrozen(accepted.cavityPoint)).toBe(true);
  expect(accepted.profileDesign).toBe(placement.profileDesign);

  release!(true);
  await vi.waitFor(() => expect(gate.isBusy()).toBe(false));
  expect(onCreated).toHaveBeenCalledTimes(1);
  expect(gate.request(placement)).toBe(true);
});

it("unlocks without reporting creation after failure or rejection", async () => {
  const create = vi.fn()
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error("failed"));
  const onCreated = vi.fn();
  const gate = createSpruePlacementRequestGate({ create, onCreated });

  expect(gate.request(placement)).toBe(true);
  await vi.waitFor(() => expect(gate.isBusy()).toBe(false));
  expect(gate.request(placement)).toBe(true);
  await vi.waitFor(() => expect(gate.isBusy()).toBe(false));
  expect(onCreated).not.toHaveBeenCalled();
});
