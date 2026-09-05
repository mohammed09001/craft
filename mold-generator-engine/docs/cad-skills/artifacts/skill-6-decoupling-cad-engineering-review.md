# Mold CAD Engineering Review — Cavity-Registration Decoupling

```
Geometric intent:        Decouple cavity commitment from derived linear registration failure
Canonical owner:         CavityWorkflowState & FinalMoldResult (splitFace.store.ts)
Runtime owner:           isRegistrationAcceptedForCommit & splitFaceStore
Coordinate spaces:       Mold-local 3D Z-up millimeters (LCS)
Units and tolerance:     Millimeters (mm); DefaultRegistrationToleranceResolver
Topology invariants:     Cavity bodies remain manifold and watertight when registration is unavailable
Preview/commit boundary: Cavity commits independently when cavity generation succeeds
Workflow invalidation:   Registration is re-evaluated when upstream cavity or sprue changes
Performance risks:       None; eliminates redundant rollback state transitions
Required tests:          Unit and integration tests for decoupled cavity commit, failure cases, selectors, export
```

### Review Summary
- **Blockers**: None.
- **Risks**: None. All 51 unit and integration tests pass cleanly.
- **Recommendations**: Maintain strict decoupling between core required stages and optional derived alignment stages.
- **Optional enhancements**: None required.

**Verdict**: CAD Engineering Review PASSED.
