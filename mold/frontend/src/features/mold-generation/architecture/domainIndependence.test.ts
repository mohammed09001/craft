import { describe, expect, it } from "vitest";

/**
 * Execution 05 Article 03: the Cavity ↔ Master Mold architectural firewall.
 *
 * No production file under `master-mold/` may import from
 * `cavity-generation/`, and none under `cavity-generation/` may import from
 * `master-mold/` -- statically OR through a dynamic `import("...")` string.
 * No workflow helper may secretly reconnect them. The two product engines
 * are peers over shared neutral infrastructure (`geometry/`, contracts);
 * neither may reach the other's domain.
 */

const FORBIDDEN = [
  {
    domain: "master-mold",
    forbidden: "cavity-generation",
  },
  {
    domain: "cavity-generation",
    forbidden: "master-mold",
  },
] as const;

// Test files may cross domains to build fixtures through both engines'
// real production paths; the firewall guards the shipped product graph.
const TEST_FILE = /\.test\.(ts|tsx)$/;

// import.meta.glob requires literal glob patterns (no template literals).
const masterMoldSources = Object.entries(
  import.meta.glob("/src/features/mold-generation/master-mold/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).filter(([path]) => !TEST_FILE.test(path));

const cavitySources = Object.entries(
  import.meta.glob("/src/features/mold-generation/cavity-generation/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).filter(([path]) => !TEST_FILE.test(path));

const sourcesByDomain: Record<string, [string, string][]> = {
  "master-mold": masterMoldSources,
  "cavity-generation": cavitySources,
};

// Matches `from "..."`, `import "..."`, and dynamic `import("...")` specifiers.
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

describe("Cavity ↔ Master Mold domain firewall (Execution 05 Article 03)", () => {
  for (const { domain, forbidden } of FORBIDDEN) {
    it(`no production file under ${domain}/ imports from ${forbidden}/`, () => {
      const sources = sourcesByDomain[domain]!;
      expect(sources.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const [path, content] of sources) {
        for (const match of content.matchAll(IMPORT_SPECIFIER)) {
          const specifier = match[1]!;
          if (specifier.includes(`/${forbidden}/`) || specifier.startsWith(`${forbidden}/`)) {
            violations.push(`${path}: "${specifier}"`);
          }
        }
      }

      expect(
        violations,
        `Forbidden ${domain} → ${forbidden} imports found:\n${violations.join("\n")}`,
      ).toEqual([]);
    });
  }
});
