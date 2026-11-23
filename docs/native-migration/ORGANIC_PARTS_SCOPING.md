# Organic parts in the Master Mold planner: scoping (option C)

Measured on the real scanned duck `Tubby_Duck_in_Parts.stl` (242,884 triangles, 13,972 mm2 of surface, release build). One change at a time, through the application's own master-mold bench. Nothing from these experiments is in the code: the switches were temporary and are reverted.

## The barriers, in the order the duck meets them

| # | Barrier | Measured | What lifting it did |
|---|---------|----------|---------------------|
| 1 | Sliver patches. About 11 needle triangles have meaningless normals that no direction can see, so full coverage can never be proven. | 11 uncovered regions with them, 1 without. | Alone, nothing: the flat-cut search still left 12% of the surface trapped (45-94 patches). Dropping them also changes the reference fixture `grooved-sphere` (848 to 842 patches). |
| 2 | The 0.999 coverage threshold. One region is 95-99% visible from its best direction, so the proof stays one region short. | With slivers gone: 103 regions, **5 pull directions cover all of them** at 0.95 or lower; at 0.99 one region stays uncovered. | At 0.9 or 0.95 the region-first path (which already exists) reaches real exact construction for the first time: 2 attempts. |
| 3 | Pieces interlock with each other. Region-first gives one physical piece per connected area per direction: 15 and 9 pieces from 5 directions. | Failed pieces release from the part itself (overlap 0.00 mm3) but overlap their sibling pieces: 1 to 25 mm3 at a 0.05 mm shift. One piece also has a 2 mm3 undercut against the part. | The strict last-to-first release order fails. |
| 4 | Release order. `useGreedyReleaseOrder` exists in the constructor and nothing turns it on. | With it, pieces do free one per round (17 left, 16, 15, ... 9), but the last 9 stay mutually stuck; the run took 496 s against the application's 180 s limit. | Still no release. |
| 5 | Piece cap. | Cap 10 instead of 6 changed nothing. | None. |

Widening the flat-cut search (all 27 directions, 12 offsets, beam 24) made the flat-cut result worse (3,700 to 5,200 mm2 trapped).

## What this says

- The failure is not one bug and not a search budget. Past the first two gates (cheap), the region-first pieces are separated by stair-stepped boundaries that are not parallel to any release direction, so sibling pieces block each other by a few cubic millimetres.
- Even a success on this path would give 9 to 15 rigid pieces, over the 6-piece ceiling and impractical to print and assemble.
- Cheap levers are exhausted. What is left is design work, not tuning:
  1. parting surfaces that follow the part's own curves between the region groups, so that neighbours slide past one another (the planner has a limited height-field fallback; it is only tried after a flat plan reaches construction);
  2. merging the many small pieces into few, with sacrificial or flexible tooling for the small trapped areas (the failures are cubic millimetres, not cubic centimetres);
  3. a speed-up of the exact release sweep, which is minutes at this size.

## Recommendation

Do not spend more on rigid tooling for this class of part. If organic parts matter to the product, the useful feature is (2): plan the few large rigid pieces and mark the small trapped areas as flexible or sacrificial tooling, with the planner and the message saying so. That is a product decision (owner) before it is an engineering task.