import { describe, expect, it } from "vitest";

/**
 * Execution 06 Article 16: Master Mold and Create Cavity are separate
 * product loops. Neither domain imports the other's production
 * orchestration or state; neutral geometry primitives remain shared.
 *
 * Sources are enumerated with import.meta.glob (build-time, no node APIs).
 */
const moldGenerationSources = import.meta.glob("/src/features/mold-generation/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function sourcesUnder(prefix: string): [string, string][] {
  return Object.entries(moldGenerationSources).filter(
    ([path]) => path.includes(prefix) && !/\.(test|spec)\.(ts|tsx)$/.test(path),
  );
}

function importsOf(content: string): string[] {
  return [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
}

const masterMoldFiles = sourcesUnder("/master-mold/");
const cavityFiles = sourcesUnder("/cavity-generation/");

describe("Master / Cavity domain separation (Execution 06 Article 16)", () => {
  it("discovers both domains' production sources", () => {
    expect(masterMoldFiles.length).toBeGreaterThan(10);
    expect(cavityFiles.length).toBeGreaterThan(3);
  });

  it("master-mold production code never imports cavity-generation", () => {
    const violations = masterMoldFiles.flatMap(([file, content]) =>
      importsOf(content)
        .filter((importPath) => importPath.includes("cavity-generation"))
        .map((importPath) => `${file}: ${importPath}`),
    );
    expect(violations).toEqual([]);
  });

  it("cavity-generation production code never imports master-mold", () => {
    const violations = cavityFiles.flatMap(([file, content]) =>
      importsOf(content)
        .filter((importPath) => importPath.includes("master-mold"))
        .map((importPath) => `${file}: ${importPath}`),
    );
    expect(violations).toEqual([]);
  });

  it("master-mold production code never imports split-face planning state (entry decoupling, Article 01)", () => {
    // Neutral type contracts (Bounds3 from splitFace.contracts) may be
    // shared; planning STATE and session orchestration may not.
    const violations = masterMoldFiles.flatMap(([file, content]) =>
      importsOf(content)
        .filter((importPath) => importPath.includes("split-face") && !importPath.endsWith("splitFace.contracts"))
        .map((importPath) => `${file}: ${importPath}`),
    );
    expect(violations).toEqual([]);
  });

  it("neutral geometry primitives stay importable from both domains", () => {
    const geometrySources = Object.keys(moldGenerationSources).filter((path) => path.includes("/geometry/"));
    expect(geometrySources.length).toBeGreaterThan(0);
    const masterUsesGeometry = masterMoldFiles.some(([, content]) => importsOf(content).some((importPath) => importPath.includes("/geometry")));
    const cavityUsesGeometry = cavityFiles.some(([, content]) => importsOf(content).some((importPath) => importPath.includes("/geometry")));
    expect(masterUsesGeometry).toBe(true);
    expect(cavityUsesGeometry).toBe(true);
  });
});
