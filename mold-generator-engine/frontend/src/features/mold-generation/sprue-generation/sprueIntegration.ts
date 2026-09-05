import {
  buildSprueGeometryContext,
  type SprueGeometryContext,
  type SprueGeometryContextInput,
} from "./sprueGeometryContext";
import {
  designSprueProfile,
  type SprueProfileDesignResult,
} from "./sprueProfileDesigner";

/**
 * Canonical integration result shared by Sprue preview and Boolean generation.
 *
 * Both consumers must use `design.profile` from this result rather than
 * calculating dimensions independently.
 */
export interface SprueIntegrationResult {
  readonly context: SprueGeometryContext | null;
  readonly design: SprueProfileDesignResult;
}

/**
 * Resolves the complete engineering profile through one canonical pipeline.
 *
 * Invalid or unavailable geometry inputs intentionally flow through
 * `designSprueProfile(null)`, which returns the controlled fallback profile.
 */
export function resolveSprueIntegration(
  input: SprueGeometryContextInput,
): SprueIntegrationResult {
  const context = buildSprueGeometryContext(input);
  const design = designSprueProfile(context);

  return {
    context,
    design,
  };
}
