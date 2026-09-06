import type { SpruePreviewPlacement } from "@/features/mold-generation/sprue-generation";

export interface SpruePlacementRequestGate {
  isBusy(): boolean;
  request(placement: SpruePreviewPlacement): boolean;
}

function immutablePlacement(
  placement: SpruePreviewPlacement,
): SpruePreviewPlacement {
  const copy: SpruePreviewPlacement = placement.status === "valid" ? {
    ...placement,
    topPoint: { ...placement.topPoint },
    cavityPoint: { ...placement.cavityPoint },
    inwardDirection: { ...placement.inwardDirection },
    profileDesign: placement.profileDesign,
  } : { ...placement, topPoint: { ...placement.topPoint }, inwardDirection: { ...placement.inwardDirection } };
  Object.freeze(copy.topPoint);
  if (copy.status === "valid") Object.freeze(copy.cavityPoint);
  Object.freeze(copy.inwardDirection);
  return Object.freeze(copy);
}

/** Prevents duplicate async creation requests at the pointer/runtime boundary. */
export function createSpruePlacementRequestGate(options: {
  readonly create: (placement: SpruePreviewPlacement) => Promise<boolean>;
  readonly onCreated: () => void;
}): SpruePlacementRequestGate {
  let busy = false;

  return {
    isBusy: () => busy,
    request: (placement) => {
      if (busy) return false;
      busy = true;
      void options
        .create(immutablePlacement(placement))
        .then((created) => {
          if (created) options.onCreated();
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
      return true;
    },
  };
}
