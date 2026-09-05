import type { RegistrationTolerancePolicy } from "./registration.contracts";

/**
 * "smallest-first" searches the profile ladder from the most minimal
 * manufacturable feature upward, stopping at the first one that clears every
 * safety test (minimizes material removed from the mold body).
 *
 * "preferred-first" searches from the workflow's preferred (largest) profile
 * downward, only falling back to a narrower profile when the preferred one
 * is unsafe for that specific interface. Segmentation uses this order because
 * segmented sections are hand-assembled after printing and benefit from a
 * more robust default alignment feature, but a segment too small to safely
 * carry that feature must still receive a smaller, safe one rather than
 * being forced to the preferred width or dropped entirely.
 */
export type RegistrationProfileSearchOrder = "smallest-first" | "preferred-first";

/**
 * Where a feature is positioned across the mating interface, independent of
 * how large it is sized (RegistrationProfileSearchOrder/preferredNominalWidthMm).
 *
 * "edge-corridor" is the original placement: a fixed inset from the
 * interface's own outer bounds, unaware of where the cavity actually sits.
 * That was a reasonable stand-in while the mold shell was thin (a 25mm
 * clearance), but is not a real "stay in solid material" guarantee.
 *
 * "cavity-wall-centered" places the feature in the middle of the actual
 * solid-material interval between the nearest cavity boundary and the
 * opposing exterior mold face on that side, when a cavity protected region
 * is available to measure against; it falls back to edge-corridor placement
 * when no cavity region is present (e.g. Segmentation planning before Create
 * Cavity has ever run) so the planner never has less information than
 * before.
 */
export type RegistrationPlacementStrategy = "edge-corridor" | "cavity-wall-centered";

export interface RegistrationSizingPolicy {
  readonly policyId: string;
  /** Width this workflow targets when the interface geometry can safely support it. */
  readonly preferredNominalWidthMm: number;
  readonly profileSearchOrder: RegistrationProfileSearchOrder;
  readonly placementStrategy: RegistrationPlacementStrategy;
}

/**
 * True manufacturable floor shared by every workflow: no profile candidate,
 * for any sizing policy, is ever generated narrower than this. It is a
 * process constant (smallest printable/hand-assemblable guide-rail width),
 * not a per-workflow preference, so it lives outside RegistrationSizingPolicy
 * and cannot be overridden by a policy value.
 */
export const REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM = 2.4;

export const NORMAL_MOLD_REGISTRATION_SIZING_POLICY: RegistrationSizingPolicy =
  Object.freeze({
    policyId: "registration-sizing-normal-v1",
    preferredNominalWidthMm: 4.5,
    profileSearchOrder: "smallest-first",
    placementStrategy: "edge-corridor",
  });

export const AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM = 30;

export const AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY: RegistrationSizingPolicy =
  Object.freeze({
    // v4: preferred target raised 10mm -> 50mm alongside the 150mm large-
    // Segmentation mold allowance, and placement switched from a fixed edge
    // corridor to cavity-wall-centered (see RegistrationPlacementStrategy).
    // v5: preferred target lowered 50mm -> 30mm alongside the large-
    // Segmentation mold allowance dropping 150mm -> 100mm
    // (AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM). Still a preferred
    // cap for sufficiently large safe interfaces, not a fixed width -- the
    // adaptive minSpan*0.11 formula in registrationPlanner.ts is unchanged,
    // it simply saturates at a lower ceiling. The version bump keeps this
    // part of the Registration dependency revision hash (see
    // buildRegistrationDependencySnapshot), so a Registration generated
    // under a prior policy version (10mm/edge-corridor, or 50mm cap) is
    // never silently reused after this policy changes.
    policyId: "registration-sizing-automatic-segmentation-v5",
    preferredNominalWidthMm:
      AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM,
    profileSearchOrder: "preferred-first",
    placementStrategy: "cavity-wall-centered",
  });

/**
 * Keeps the tolerance policy's feature-radius contract compatible with the
 * workflow's preferred nominal width. Female clearance remains independently
 * owned by radialClearanceMm.
 */
export function applyRegistrationSizingToTolerancePolicy(
  tolerancePolicy: RegistrationTolerancePolicy,
  sizingPolicy: RegistrationSizingPolicy,
): RegistrationTolerancePolicy {
  return Object.freeze({
    ...tolerancePolicy,
    maximumFeatureRadiusMm: Math.max(
      tolerancePolicy.maximumFeatureRadiusMm,
      sizingPolicy.preferredNominalWidthMm / 2,
    ),
  });
}
