import { DefaultRegistrationToleranceResolver } from "./registrationTolerance.policy";
import {
  applyRegistrationSizingToTolerancePolicy,
  AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM,
  AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
  NORMAL_MOLD_REGISTRATION_SIZING_POLICY,
  REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM,
} from "./registrationSizing.policy";

describe("Registration sizing policy", () => {
  it("owns the automatic Segmentation 30 mm preferred width without changing normal molds", () => {
    expect(AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM).toBe(30);
    expect(AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY.preferredNominalWidthMm).toBe(30);
    expect(AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY.profileSearchOrder).toBe("preferred-first");
    expect(NORMAL_MOLD_REGISTRATION_SIZING_POLICY.preferredNominalWidthMm).toBeLessThan(30);
    expect(NORMAL_MOLD_REGISTRATION_SIZING_POLICY.profileSearchOrder).toBe("smallest-first");
  });

  it("only Automatic Segmentation switches placement from the legacy edge corridor to cavity-wall centering", () => {
    expect(NORMAL_MOLD_REGISTRATION_SIZING_POLICY.placementStrategy).toBe("edge-corridor");
    expect(AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY.placementStrategy).toBe("cavity-wall-centered");
  });

  it("shares one true manufacturing floor no policy can override", () => {
    expect(REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM).toBeLessThan(
      NORMAL_MOLD_REGISTRATION_SIZING_POLICY.preferredNominalWidthMm,
    );
    expect(REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM).toBeLessThan(
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY.preferredNominalWidthMm,
    );
  });

  it("opens the canonical radius contract for 30 mm profiles without changing female clearance", () => {
    const base = new DefaultRegistrationToleranceResolver().resolve(null);
    const automatic = applyRegistrationSizingToTolerancePolicy(
      base,
      AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY,
    );

    expect(automatic.maximumFeatureRadiusMm).toBeGreaterThanOrEqual(15.0);
    expect(automatic.radialClearanceMm).toBe(base.radialClearanceMm);
  });
});
