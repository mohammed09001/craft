import { describe, expect, it } from "vitest";

const productionSourceFiles = import.meta.glob("./*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const forbiddenInternalBarrelImports = [
  'from "./index"',
  "from './index'",
  'from "../index"',
  "from '../index'",
  'from "../../index"',
  "from '../../index'",
];

const isProductionImplementationFile = (filePath: string): boolean => {
  return (
    !filePath.endsWith(".test.ts") &&
    !filePath.endsWith(".public-api.test.ts") &&
    !filePath.endsWith(".parent-api.test.ts") &&
    !filePath.endsWith(".engineering-reports-api.test.ts") &&
    !filePath.endsWith(".attachment-parent-api.test.ts") &&
    !filePath.endsWith(".attachment-engineering-reports-api.test.ts") &&
    !filePath.endsWith(".architecture.test.ts")
  );
};

describe("pull direction evaluation architecture", () => {
  it("does not import internal barrels from production implementation files", () => {
    const violations = Object.entries(productionSourceFiles)
      .filter(([filePath]) => isProductionImplementationFile(filePath))
      .flatMap(([filePath, source]) => {
        const sourceText = String(source);

        return forbiddenInternalBarrelImports
          .filter((forbiddenImport) => sourceText.includes(forbiddenImport))
          .map((forbiddenImport) => {
            return `${filePath} imports ${forbiddenImport}`;
          });
      });

    expect(violations).toEqual([]);
  });

  it("keeps the public barrel file free from runtime implementation logic", () => {
    const indexSource = productionSourceFiles["./index.ts"];

    expect(typeof indexSource).toBe("string");

    const sourceText = String(indexSource);

    expect(sourceText).not.toContain("const ");
    expect(sourceText).not.toContain("let ");
    expect(sourceText).not.toContain("function ");
    expect(sourceText).not.toContain("=>");
    expect(sourceText).not.toContain("class ");
  });
});

