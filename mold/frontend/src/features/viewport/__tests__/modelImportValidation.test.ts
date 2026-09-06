import {
  MAX_LOCAL_STL_FILE_SIZE_BYTES,
  validateLocalStlFiles,
} from "@/features/viewport";

function createFile(name: string, content: string) {
  return new File([content], name);
}

it("accepts one non-empty STL file", () => {
  const file = createFile("part.stl", "solid part\nendsolid part");
  const result = validateLocalStlFiles([file]);

  expect(result).toEqual({
    ok: true,
    file,
  });
});

it("rejects multiple files", () => {
  const result = validateLocalStlFiles([
    createFile("one.stl", "solid one"),
    createFile("two.stl", "solid two"),
  ]);

  expect(result).toEqual({
    ok: false,
    status: {
      phase: "invalid",
      message: "Choose exactly one STL file.",
    },
  });
});

it("rejects non-STL files by extension", () => {
  const result = validateLocalStlFiles([createFile("part.obj", "v 0 0 0")]);

  expect(result).toEqual({
    ok: false,
    status: {
      phase: "invalid",
      message: "Only .stl files are supported.",
    },
  });
});

it("rejects empty STL files", () => {
  const result = validateLocalStlFiles([createFile("empty.stl", "")]);

  expect(result).toEqual({
    ok: false,
    status: {
      phase: "invalid",
      message: "The STL file is empty.",
    },
  });
});

it("rejects files beyond the local browser size limit", () => {
  const file = createFile("large.stl", "solid large");

  Object.defineProperty(file, "size", {
    configurable: true,
    value: MAX_LOCAL_STL_FILE_SIZE_BYTES + 1,
  });

  const result = validateLocalStlFiles([file]);

  expect(result).toEqual({
    ok: false,
    status: {
      phase: "invalid",
      message: "The STL file is too large for local loading.",
    },
  });
});

