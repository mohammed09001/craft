import { SEGMENTATION_VISUALIZATION_PHASES } from "@/features/mold-generation/segmentation/workflowRoute";

describe("SEGMENTATION_VISUALIZATION_PHASES", () => {
  it("covers exactly the phases in which a plan/result should be visualized", () => {
    expect(SEGMENTATION_VISUALIZATION_PHASES).toEqual([
      "preview",
      "accepted",
      "executing",
      "valid",
    ]);
  });
});
