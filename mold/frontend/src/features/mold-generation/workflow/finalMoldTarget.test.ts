import { describe, expect, it } from "vitest";

import type { ReferenceMoldDefinition } from "../reference-mold-definition";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } from "../registration/registrationSizing.policy";
import { registrationSizingPolicyFor } from "./finalMoldTarget";

describe("registrationSizingPolicyFor", () => {
  it("omits the field entirely for a Cut by Face definition (no segmentationLineage)", () => {
    const definition = {} as ReferenceMoldDefinition;
    expect(registrationSizingPolicyFor(definition)).toEqual({});
  });

  it("selects the automatic-segmentation sizing policy when segmentationLineage is true", () => {
    const definition = { segmentationLineage: true } as ReferenceMoldDefinition;
    expect(registrationSizingPolicyFor(definition)).toEqual({
      registrationSizingPolicy: AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    });
  });
});
