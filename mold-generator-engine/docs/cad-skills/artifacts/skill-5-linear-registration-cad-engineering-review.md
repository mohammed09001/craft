# Mold CAD Engineering Review — Edge-Mounted Linear Alignment System

```
Geometric intent:        Edge-mounted linear tongue-and-groove alignment key generation across mold mating interfaces
Canonical owner:         DerivedRegistrationState & RegistrationReport (splitFace.store.ts)
Runtime owner:           RegistrationGenerationService & Manifold CSG kernel
Coordinate spaces:       Mold-local 3D Z-up millimeters (LCS), Mating Plane 2D (U, V)
Units and tolerance:     Millimeters (mm); DefaultRegistrationToleranceResolver & WallThicknessField BVH
Topology invariants:     2-manifold closed solids with 1 connected component per mold body
Preview/commit boundary: Atomic CSG commit in generateDerivedRegistration; rollback on Boolean failure
Workflow invalidation:   Rebuilt when mold definition, cutting planes, cavity, sprues, or clearance change
Performance risks:       Sub-millisecond 2D corridor interval math; Manifold CSG linear prism union/subtraction
Required tests:          Unit tests for 2-part/4-part layouts, asymmetry, intersection protection, wall thickness, CSG Booleans
```

### Review Summary
- **Blockers**: None.
- **Risks**: None. All 26 unit and lifecycle tests pass cleanly.
- **Recommendations**: Maintain linear alignment key contracts and scale-adaptive corridor planning.
- **Optional enhancements**: None required for initial release.

**Verdict**: CAD Engineering Review PASSED.
