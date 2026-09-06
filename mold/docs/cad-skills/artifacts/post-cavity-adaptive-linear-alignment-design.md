# Post-Cavity Adaptive Linear Alignment System Design Specification

```
Document Version: 1.1.0 (Section "Automatic Segmentation Policy Revision" superseded — see v2 note)
Author: cad-algorithm-designer & geometry-computational-specialist
Status: APPROVED
Target Subsystem: frontend/src/features/mold-generation/registration & workflow
```

---

## 1. Executive Summary & Root Cause Analysis

### Reported Problem
After cavity creation succeeds, the cavity remains visible and committed (confirming the previous decoupling fix is intact), but the Edge-Mounted Linear Alignment keys disappear from the active mold bodies.

### Root Cause Analysis
1. **Broad AABB Exclusion Bug**: In `registrationPlanner.ts` (`isPointSafeFromRegions`), candidate corridor points `pt` were tested against `region.bounds.min` and `region.bounds.max` (the cavity's 2D AABB bounding box in $(u,v)$). Even when `field.clearanceAt(pt)` (the true Signed Distance Field to the cavity surface) indicated plenty of safe clearance, the broad AABB bounding box excluded safe side-corridor points whenever the cavity bounding box extended near the sides of the mold block.
2. **Overly Bulky Key Cross-Section**: `planRegistrationLayout` computed `keyWidthMm` as up to 10mm (or `minSpan * 0.14`) and `keyDepthMm` as up to `minBodyThickness * 0.18` (or `keyWidthMm * 0.65`). For ordinary mold sizes (e.g. 40mm–100mm), this produced large structural blocks (e.g. 5.6mm wide, 3.64mm deep) that consumed excessive wall thickness. When a cavity was created, the remaining wall between the key socket and the cavity surface fell below `policy.minimumWallMm` (1.2mm), causing `filterByWallThickness` to reject candidate keys.
3. **Lack of Minimum Sufficient Profile Search**: The planner evaluated only a single large profile rather than searching upward from a minimal, adaptive alignment profile (thin guide rail).

---

## 2. Terminology & System Identity

- **System Name**: Edge-Mounted Linear Alignment System
- **Male Feature**: Linear Alignment Tongue
- **Female Feature**: Linear Alignment Groove
- **Pair**: Linear Registration Key
- **Forbidden Terms in Production Code**: `hook`, `lock`, `clamp`, `fastening key`.
- **Purpose**: Alignment, positioning, maintaining parallel mold sections, preventing lateral drift, guiding mold parts into position. (Not locking or clamping).

---

## 3. Mandatory Layout Rules

### Two-Part Molds
- **Key Count**: Exactly two logical linear registration keys per two-part mold.
- **Corridors**: One along the left edge corridor, one along the right edge corridor.
- **Orientation**: Running top-to-bottom (longitudinal).
- **No Central Placement**: Keys are placed strictly along side corridors ($u$-min and $u$-max outer margins), never in the middle.
- **Controlled Asymmetry**: Left key runs near full longitudinal span; right key is slightly offset/shortened for visual & mechanical orientation control.

### Multi-Part Molds (4+ Sections)
- **Interface Graph**: Plan only on real mating interfaces.
- **Orientation Rules**: Vertical interfaces use left/right corridors; horizontal interfaces use top/bottom edge corridors.
- **Intersection Zones**: Protected exclusion zone around split crossings to avoid corner collisions.

---

## 4. Adaptive Sizing & Minimum Sufficient Profile Search

### Small Alignment Feature Geometry
- **Narrow Width**: Bounded between printable minimum (e.g. 2.4mm) and modest maximum (e.g. 4.0mm).
- **Shallow Depth**: Shallow protrusion (e.g. 1.0mm–1.8mm), depth-to-width ratio $\approx 0.45$.
- **Lead-In Chamfer**: Small lead-in (0.3mm–0.5mm) for smooth engagement.
- **Root Fillet**: Filleted root (0.4mm–0.6mm) for structural integrity without stress risers.
- **Taper Angle**: Modest taper (10°–12°).

### Minimum Sufficient Profile Search Algorithm
Instead of starting from a large profile and failing, `planRegistrationLayout` performs a deterministic search from smallest valid profile upward:
1. **Candidate Profile Generation**:
   - Profile 0 (Minimum): `width = Math.max(2.4, minSpan * 0.05)`, `depth = Math.max(1.0, width * 0.42)`
   - Profile 1 (Moderate): `width = Math.max(3.0, minSpan * 0.08)`, `depth = Math.max(1.2, width * 0.45)`
   - Profile 2 (Standard): `width = Math.max(3.6, minSpan * 0.10)`, `depth = Math.max(1.5, width * 0.48)`
2. **Evaluation Criteria**:
   - Test true geometric clearance (`field.clearanceAt(pt) >= policy.minimumWallMm`).
   - Test external surface wall thickness (`externalSurfaceClearanceMm >= policy.minimumWallMm`).
   - Test CSG protected region intersection volume (`vol <= policy.booleanToleranceMm^3`).
3. **Selection Rule**: Select the **smallest** profile that satisfies all safety and printable manufacturing constraints.

### Sublinear Scaling
- **Length**: Follows available interface length adaptively.
- **Width & Depth**: Scale sublinearly with mold dimensions. A 200mm mold block receives a longer key, but its width is capped (e.g. $\le 4.5\text{mm}$) and depth capped (e.g. $\le 2.0\text{mm}$), preserving thin guide rail visual identity.

### Automatic Segmentation Policy Revision (v2 — supersedes the v1 fixed 5 mm floor)

> **Status update:** The v1 rule below ("Automatic Segmentation must not
> silently retry below 5 mm") is superseded. In production it degraded to a
> universal `finalWidth = max(adaptiveWidth, 5.0)` floor applied to *every*
> profile candidate, which collapsed the adaptive profile ladder (Section 4)
> to a single flat 5 mm value regardless of interface size — a small
> segment and a large segment received an identical feature, and a segment
> whose interface could not safely carry 5 mm was rejected outright instead
> of receiving a smaller safe one. That is not genuine per-interface
> adaptivity, so the rule is revised below.

- The restrained profile limits in Section 4 remain authoritative for the
  normal small-model workflow (`profileSearchOrder: "smallest-first"`):
  search the profile ladder from the smallest manufacturable candidate
  upward and stop at the first one that clears every safety test.
- Automatic Segmentation keeps 5 mm as its **preferred** nominal width
  (`preferredNominalWidthMm`, `profileSearchOrder: "preferred-first"`) —
  segmented sections are hand-assembled after printing and benefit from a
  more robust default alignment feature when the interface can support it.
  But "preferred" is no longer a floor: the profile ladder is searched from
  the preferred (largest) candidate downward, falling back to a smaller
  candidate — down to the same shared manufacturing minimum used by every
  other workflow (`REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM = 2.4 mm`) —
  whenever the preferred one is unsafe for that specific interface.
- A small interface therefore receives a genuinely smaller feature (as low
  as ~2.4–3.6 mm depending on its own usable span and body thickness) instead
  of either an oversized 5 mm feature or an outright rejection. A large
  interface still reaches the full 5 mm preferred width, matching the
  original intent of this section.
- Preview and committed Segmentation Registration continue to consume the
  same sizing policy through the Registration lifecycle dependency snapshot
  — this revision changed only what the policy computes, not which code
  paths consume it.
- The existing radial-clearance policy still enlarges the female Boolean
  tool; the preferred nominal width does not remove the male/female
  tolerance relationship.
- If no profile — down to the shared manufacturing minimum — can satisfy
  wall thickness, protected-region, separation, or Boolean validation,
  Registration returns its existing blocked result and preserves the valid
  unkeyed segmented bodies, exactly as before.

---

## 5. Geometric Clearance & BVH Distance Fields

- **Removal of Broad AABB Rejection**: In `isPointSafeFromRegions`, protected regions with mesh representations (cavities, sprues) evaluate distance exclusively via `field.clearanceAt(pt)` (BVH Signed Distance Field).
- **True Surface Clearance**: Bounding box overlap is used only for fast spatial indexing; actual point rejection relies strictly on exact surface distance to the cavity mesh.

---

## 6. Lifecycle, Revision & Source-Body Ownership

### Dependency Chain
$$\text{Base Split Bodies} \longrightarrow \text{Cavity Bodies} \longrightarrow \text{Sprue-Applied Bodies} \longrightarrow \text{Derived Registered Bodies}$$

### Revision Snapshot Fingerprint
`buildRegistrationDependencySnapshot` includes:
- Upstream mold body geometry versions (`geometryVersion`).
- Cavity revision signature (`cavityRevision`).
- Cavity tool mesh and bounds (`cavityTool`).
- Resolved sprue definitions (`sprues`).
- Manufacturing profile settings (`manufacturingProfile`).

### Selector Rules (`selectActiveMoldBodies`)
1. **Priority 1**: `lastCommittedResult.bodies` when `registration.status === "generated"` (`keyed: true`).
2. **Priority 2**: `lastCommittedResult.bodies` (unkeyed cavity/sprue bodies) when `registration.status === "blocked"` / `"unavailable"` (`keyed: false`).
3. **Priority 3**: `definition.moldBodies` (pre-cavity split base bodies).

---

## 7. Regression Protection & Test Strategy

### Mandatory Integration Tests
1. **Scenario A (Post-Cavity Alignment Valid)**:
   - 2-part mold $\rightarrow$ 2 keys before cavity.
   - Cavity created with central cavity tool.
   - Linear alignment regenerated on post-cavity bodies.
   - Cavity remains visible + active bodies contain cavity + linear tongue/groove geometry.
   - Exactly two logical keys (left and right, top-to-bottom).
2. **Scenario B (Unsafe Post-Cavity Alignment)**:
   - Cavity created with massive cavity tool consuming 95% of mold block volume.
   - Registration becomes `"blocked"`, cavity remains committed and visible.
   - Active bodies fall back to valid unkeyed cavity bodies without error.
3. **Scenario C (Adaptive Scaling)**:
   - Small mold vs large mold: verify key lengths adapt, but width and depth remain restrained.

---

## 8. Loop Engine Execution & Verification

- **RUN_ID**: `run-1784820849177-4dcbf0`
- **Execution Mode**: Explicit Portable Loop Mode
- **Status Identifiers**:
  - `POST_CAVITY_ALIGNMENT_REGENERATION_PASS`
  - `ADAPTIVE_SMALL_ALIGNMENT_PROFILE_PASS`
  - `CAVITY_DECOUPLING_REGRESSION_PASS`
  - `LOOP_ENGINE_PASS`
