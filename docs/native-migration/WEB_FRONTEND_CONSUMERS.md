# Consumers of the web frontend (`mold/frontend`) -- RC-1 inventory

Date: 2026-11-23. Method: grep for `frontend`, `npm`, `vitest` across `.github`, `scripts`, `native`, `docs`, plus a look at the CMake and the workflows. Nothing has been removed.

## What must be replaced or moved before the web app can be deleted

| # | Consumer | Kind | What depends on it | Needed before removal |
|---|---|---|---|---|
| 1 | `native/tests/fixtures/...` via `scripts/native/generate-reference-fixtures.ps1` + `native/tests/reference/*.test.ts` (14 generators, plus `make_readiness_samples.py`) | fixture generators | They import the real TypeScript pipeline and `manifold-3d` WASM through `mold/frontend` (vitest, `@` alias, `node_modules`) | Fixtures are already committed (16 JSON files). Either archive the generators with a note that regeneration needs the old tree at a tagged commit, or keep a minimal pinned reference package. Decision needed (owner/engineering) |
| 2 | `native/tests/tst_app_workflow.cpp` lines ~2986 and ~3364 | native test input | Reads `mold/frontend/e2e/fixtures/highpoly_sphere_15mm_ascii.stl` and `box_30mm_ascii.stl` through `CRAFT_REPO_ROOT` | **Move both STLs into `native/tests/fixtures/` and change the two paths first.** This is a hard break otherwise |
| 3 | `scripts/native/compare-viewport.ps1`, `ab-viewport.ps1` | comparison tooling | Runs a production build of the web app as the viewport reference | Frozen reference screenshots must be kept (VIEWPORT_COMPARISON.md); the scripts become archive-only |
| 4 | `.github/workflows/ci.yml` jobs `frontend-quality`, `browser-smoke`, and their entries in `quality-gate` | CI | `npm ci`, audit, lint, typecheck, build, vitest, Playwright | Remove the two jobs and the gate entries in the same commit as the frontend |
| 5 | `.github/workflows/master-mold-ci.yml` | CI | Frontend typecheck, lint, tests, build for the web Master Mold | Remove or re-point to native Master Mold tests |
| 6 | `.github/dependabot.yml` | CI config | `npm` ecosystem for `/mold/frontend` | Drop the npm block |
| 7 | `native/cmake/CraftManifold.cmake` comment; `native/io/stl/Stl.h` comment; JSON `generatedFrom` fields | comments only | Cite the reference by path | Keep as history; the paths must resolve to a tag or archive note |
| 8 | `docs/native-migration/*`, `mold/docs/*`, `Execution/*` | docs | Mention the web app | Update or archive after removal |
| 9 | `mold/.claude/settings.local.json` | local tooling | Allowlist entries | Not a product dependency; clean up with the removal |

## Must stay (not part of the web app)

`mold/src` (Python engineering engine, used by the native app via `CRAFT_ENGINE_SRC`), `mold/tests`, `mold/pyproject.toml`, the `python-quality` job in `ci.yml`, and the `repository-integrity` job (check what it asserts about the frontend before removal).

## Order of work for RC-3

1. Move the two e2e STLs and fix the two paths in `tst_app_workflow.cpp` (safe, testable now).
2. Decide the fate of the 14 fixture generators (archive tag or keep a pinned reference).
3. Remove the CI jobs and dependabot block together with `mold/frontend`.
4. Gate: all native parity rows pass on the final tree and a full Debug and Release CTest is green after the move.
