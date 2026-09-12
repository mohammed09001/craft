import { describe, expect, it } from "vitest";

import type { MasterMoldParameters } from "./masterMold.contracts";
import { buildMasterMoldSourceFingerprint, isMasterMoldBodyCurrent } from "./masterMold.fingerprint";

const PARAMETERS: MasterMoldParameters = { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 };

describe("buildMasterMoldSourceFingerprint", () => {
  it("is deterministic for identical inputs", () => {
    const first = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const second = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    expect(first).toEqual(second);
  });

  it("changes when the final-mold geometry version changes", () => {
    const before = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const after = buildMasterMoldSourceFingerprint("geom:a:2", PARAMETERS, null);
    expect(after.value).not.toBe(before.value);
  });

  it("changes when a parameter (e.g. wall thickness) changes", () => {
    const before = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const after = buildMasterMoldSourceFingerprint("geom:a:1", { ...PARAMETERS, wallThicknessMm: PARAMETERS.wallThicknessMm + 1 }, null);
    expect(after.value).not.toBe(before.value);
    expect(after.parametersSignature).not.toBe(before.parametersSignature);
  });

  it("changes when the direction override changes, including null vs. an explicit direction", () => {
    const auto = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const overridden = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, "+Z");
    const differentOverride = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, "-X");

    expect(overridden.value).not.toBe(auto.value);
    expect(overridden.value).not.toBe(differentOverride.value);
  });

  it("carries the exact geometry version and direction override as provenance fields, not just an opaque hash", () => {
    const fingerprint = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, "+Z");
    expect(fingerprint.finalMoldGeometryVersion).toBe("geom:a:1");
    expect(fingerprint.directionOverride).toBe("+Z");
    expect(fingerprint.value.startsWith("master-mold:")).toBe(true);
  });
});

describe("isMasterMoldBodyCurrent", () => {
  it("is true only when both fingerprints' values are identical", () => {
    const a = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const b = buildMasterMoldSourceFingerprint("geom:a:1", PARAMETERS, null);
    const c = buildMasterMoldSourceFingerprint("geom:a:2", PARAMETERS, null);

    expect(isMasterMoldBodyCurrent(a, b)).toBe(true);
    expect(isMasterMoldBodyCurrent(a, c)).toBe(false);
  });
});
