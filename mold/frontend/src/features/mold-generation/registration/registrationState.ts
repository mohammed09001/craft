import type { RegistrationReport, RegistrationSourceBody } from "./registration.contracts";

/**
 * Kept in its own module, separate from registrationLifecycle.ts, so that
 * boot-eager consumers (splitFace.store.ts, segmentation.store.ts) can read
 * the idle registration state without statically pulling in
 * RegistrationGenerationService's manifold-3d dependency -- generation only
 * ever runs inside the derived-mold Worker/dynamic-import boundary.
 */
export interface DerivedRegistrationState {
  readonly status: "unavailable" | "generating" | "generated" | "blocked" | "failed" | "cancelled" | "stale";
  readonly revision: string | null;
  readonly bodies: readonly RegistrationSourceBody[] | null;
  readonly report: RegistrationReport | null;
}

export const unavailableRegistration = (): DerivedRegistrationState => ({
  status: "unavailable",
  revision: null,
  bodies: null,
  report: null,
});
