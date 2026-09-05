import {
  createModelInspectionStatus,
  formatFileSize,
} from "@/features/viewport";

it.each([
  [0, "0 B"],
  [512, "512 B"],
  [2048, "2.0 KB"],
  [2 * 1024 * 1024, "2.0 MB"],
  [-1, "Unknown size"],
] satisfies Array<[number, string]>)(
  "formats %s bytes as %s",
  (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  },
);

it("creates a serializable inspection snapshot with triangle and vertex counts", () => {
  expect(
    createModelInspectionStatus({
      fileName: "part.stl",
      fileSize: 2048,
      geometryVertexCount: 6,
    }),
  ).toEqual({
    phase: "ready",
    fileName: "part.stl",
    fileSize: 2048,
    fileSizeLabel: "2.0 KB",
    format: "STL",
    geometryVertexCount: 6,
    geometryVertexCountLabel: "6",
    triangleCount: 2,
    triangleCountLabel: "2",
  });
});

it("omits triangle count when vertex count is not divisible by three", () => {
  expect(
    createModelInspectionStatus({
      fileName: "part.stl",
      fileSize: 10,
      geometryVertexCount: 5,
    }),
  ).toEqual({
    phase: "ready",
    fileName: "part.stl",
    fileSize: 10,
    fileSizeLabel: "10 B",
    format: "STL",
    geometryVertexCount: 5,
    geometryVertexCountLabel: "5",
  });
});

