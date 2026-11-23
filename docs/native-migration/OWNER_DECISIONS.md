# Open owner decisions -- Windows release (2026-11-23)

Every question below blocks something engineering cannot decide. Each has the exact question, why it matters, and a recommended default. Nothing here has been decided on the owner's behalf; the "default" is only what engineering would do if told "use your judgement". Legal and signing items are not engineering decisions at all.

## A. Needed to call the product distributable (matrix P0-7, PK-3, PK-5)

| # | Question | Why it matters | Recommended default |
|---|---|---|---|
| A1 | How is Qt Quick 3D licensed for Craft: buy a commercial Qt licence, or release Craft under GPL-3.0? (R-License-1; the Qt SBOM lists Quick 3D 6.8.3 as `Commercial OR GPL-3.0-only`) | Gates every distribution. Engineering inventory is not legal advice | Get legal review first. No engineering default; the package stays internal-test only |
| A2 | What is Craft's own licence? | Needed in the installer and notices | Decide together with A1 |
| A3 | Code-signing certificate: kind, who holds it, where signing runs | An unsigned installer triggers SmartScreen warnings. Engineering will not create or fake one | Standard OV or EV code-signing certificate, signing on a controlled machine |
| A4 | Approve the update strategy (UPDATE_STRATEGY.md): manual signed installer, no updater, no network access | v1 scope | Approve as written |
| A5 | Where are releases published and who may publish? | Needed for the release checklist | A single download page owned by the product owner |
| A6 | How many previous minor versions get fixes; any channel besides "latest"? | Support commitment | Latest minor only; one channel |

## B. Product scope (matrix P1-10, P2-5, RC-3)

| # | Question | Why it matters | Recommended default |
|---|---|---|---|
| B1 | Confirm linked projects: embedded-only for v1? (D-121) | The app writes embedded projects only; nothing in the UI creates a linked one; reading and relinking one works and is tested | Confirm embedded-only |
| B2 | Master Mold time limit (now 180 s, a controller setting) and what to do beyond it | Medium gear needs about 450 s, medium ring 125.7 s (R-Parts-2). A longer limit makes large parts usable but the UI is held by a winding-down job (D-106) | Keep 180 s; offer a clearly labelled "allow longer" choice only if users ask |
| B3 | Make the self-intersection preflight robust (small gear and ring are refused today, as in the reference) | Would let more real parts through; changes a safety check, so it needs its own measured validation against the reference fixtures | Do not change until a real part is blocked wrongly in the field |
| B4 | Remove the web app and its required CI gates (`frontend-quality`, `browser-smoke`, `master-mold-ci.yml`, dependabot npm)? Steps are in WEB_FRONTEND_CONSUMERS.md | Required for the "one maintained product" goal. Removes required gates, so it needs an explicit yes | Yes, after the generators are archived: local tag `web-reference-final` already marks the last tree with the web reference |
| B5 | What happens to the 14 TypeScript fixture generators? | They need the web tree to run | Archive at the tag; keep the 16 committed fixtures as the regression data |

## C. Authorisation and environment

| # | Item | Needed |
|---|---|---|
| C1 | Push `feature/native-desktop-migration` | Explicit approval. Needed to run `windows-native.yml` for the first time (P1-11). Commits so far are local only |
| C2 | A clean Windows VM or image without Qt, Python or MSVC | The last part of P0-6 |
| C3 | Permission for WiX use is already given (MSI built and tested, PK-2); only needed if a different installer toolchain is wanted | None |

## Status vocabulary for the final report

- Windows engineering complete: all matrix rows pass except those blocked on A, B4 or C.
- Windows packaging complete: needs C2 and a signed installer (A3).
- Windows legally ready for distribution: needs A1, A2, A3.
