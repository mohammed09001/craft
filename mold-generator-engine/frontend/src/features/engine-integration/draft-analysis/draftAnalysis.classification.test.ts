import { describe, expect, it } from "vitest";

import { classifyDraftFaceBand } from "./draftAnalysis.classification";

describe("classifyDraftFaceBand", () => {
  it("classifies positive draft angles above tolerance", () => {
    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: 1,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("positive_draft");
  });

  it("classifies negative draft angles below negative tolerance", () => {
    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: -1,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("negative_draft");
  });

  it("classifies near-zero draft angles within tolerance", () => {
    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: 0.2,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("zero_draft");

    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: -0.2,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("zero_draft");
  });

  it("treats null or NaN draft angles as undetermined", () => {
    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: null,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("undetermined");

    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: Number.NaN,
        zeroDraftToleranceDegrees: 0.25,
      }),
    ).toBe("undetermined");
  });

  it("normalizes negative tolerance values to zero", () => {
    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: 0,
        zeroDraftToleranceDegrees: -5,
      }),
    ).toBe("zero_draft");

    expect(
      classifyDraftFaceBand({
        draftAngleDegrees: -0.01,
        zeroDraftToleranceDegrees: -5,
      }),
    ).toBe("negative_draft");
  });
});
