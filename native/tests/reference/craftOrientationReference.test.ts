/**
 * Part orientation reference fixture generator for the native migration.
 *
 * Runs the REAL reference modules:
 *  - partOrientation.store.ts: composePartFlip (the five flip steps, the composition, normalisation, snapping and sign rule),
 *    and the store's flip / reset / commit behaviour including its capability gate;
 *  - automaticModelOrientation.ts: the six candidate orientations, their scores and bounds, the selection rule with its
 *    epsilons, and prepareAutomaticModelOrientation;
 *  - localStlImport.ts applyPartOrientation's geometry steps (geometry.applyQuaternion, then the grounding translation).
 * Replayed by tst_orientation_equivalence.cpp.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Quaternion,
  SphereGeometry,
} from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import {
  IDENTITY_PART_ORIENTATION,
  composePartFlip,
  usePartOrientationStore,
  type PartFlipDirection,
  type PartOrientation,
} from "@/features/viewport/partOrientation.store";
import {
  ORIENTATION_CANDIDATES,
  evaluateOrientationCandidates,
  prepareAutomaticModelOrientation,
  selectBestOrientationCandidate,
} from "@/features/viewport/runtime/automaticModelOrientation";
import { calculateModelGroundingTransform } from "@/features/viewport/runtime/modelGrounding";

const outputPath = resolve(process.env.CRAFT_ORIENTATION_OUTPUT ?? "orientation-reference.json");

function nonIndexed(geometry: BufferGeometry): BufferGeometry {
  const g = geometry.index === null ? geometry : geometry.toNonIndexed();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  return g;
}

function wedge(): BufferGeometry {
  // A right triangular prism lying on its slanted face's complement: asymmetric, with one large flat face.
  const p = [
    [0, 0, 0], [40, 0, 0], [0, 20, 0], // bottom
    [0, 0, 10], [40, 0, 10], [0, 20, 10], // top
  ];
  const tri = [
    [0, 2, 1], [3, 4, 5],
    [0, 1, 4], [0, 4, 3],
    [1, 2, 5], [1, 5, 4],
    [2, 0, 3], [2, 3, 5],
  ];
  const out: number[] = [];
  for (const t of tri) for (const i of t) out.push(...p[i]!);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  return g;
}

function transformed(geometry: BufferGeometry, q: PartOrientation, shift: [number, number, number] = [0, 0, 0]) {
  const g = geometry.clone();
  g.applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
  g.translate(shift[0], shift[1], shift[2]);
  return g;
}

function describeBounds(b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) {
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
}

function positionsOf(geometry: BufferGeometry): number[] {
  return Array.from(geometry.getAttribute("position").array as Float32Array);
}

// Deterministic generator so the fixture is reproducible.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

it("records the part orientation reference", () => {
  const bracketBytes = readFileSync(process.env.CRAFT_BRACKET_STL ?? "bracket.stl");
  const bracket = nonIndexed(new STLLoader().parse(bracketBytes.buffer.slice(bracketBytes.byteOffset, bracketBytes.byteOffset + bracketBytes.byteLength)));
  const tilt = { x: 0.3, y: 0.2, z: 0.1, w: 0 };
  const tiltLength = Math.hypot(tilt.x, tilt.y, tilt.z, 0.9);
  const tiltQ = { x: tilt.x / tiltLength, y: tilt.y / tiltLength, z: tilt.z / tiltLength, w: 0.9 / tiltLength };

  const meshes: Array<{ name: string; geometry: BufferGeometry }> = [
    { name: "bracket", geometry: bracket },
    { name: "box", geometry: transformed(nonIndexed(new BoxGeometry(10, 20, 30)), IDENTITY_PART_ORIENTATION, [7, -3, 40]) },
    { name: "cube-ties", geometry: nonIndexed(new BoxGeometry(25, 25, 25)) },
    { name: "wedge", geometry: wedge() },
    { name: "wedge-tilted", geometry: transformed(wedge(), tiltQ, [1, 2, 3]) },
    { name: "bracket-tilted", geometry: transformed(bracket, tiltQ) },
    { name: "rod-x", geometry: transformed(nonIndexed(new CylinderGeometry(4, 4, 60, 24)), { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }) },
    { name: "sphere", geometry: nonIndexed(new SphereGeometry(15, 16, 10)) },
    { name: "plate", geometry: transformed(nonIndexed(new BoxGeometry(80, 50, 3)), { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }) },
  ];

  const flipDirections: PartFlipDirection[] = ["left", "right", "forward", "backward", "upside-down"];
  const single: Record<string, PartOrientation> = {};
  for (const d of flipDirections) single[d] = composePartFlip(IDENTITY_PART_ORIENTATION, d);

  const random = lcg(20260121);
  const flipSequences = [] as Array<{ directions: PartFlipDirection[]; results: PartOrientation[] }>;
  for (let s = 0; s < 12; s += 1) {
    const directions: PartFlipDirection[] = [];
    const results: PartOrientation[] = [];
    let q: PartOrientation = IDENTITY_PART_ORIENTATION;
    for (let i = 0; i < 40; i += 1) {
      const d = flipDirections[Math.floor(random() * flipDirections.length)]!;
      q = composePartFlip(q, d);
      directions.push(d);
      results.push({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    flipSequences.push({ directions, results });
  }
  // A non-axis start (a hand-committed orientation) also composes.
  const odd: PartOrientation = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
  const fromOdd = flipDirections.map((d) => ({ direction: d, start: odd, result: composePartFlip(odd, d) }));

  const auto = meshes.map(({ name, geometry }) => {
    const evaluations = evaluateOrientationCandidates(geometry);
    const best = selectBestOrientationCandidate(evaluations);
    const preparation = prepareAutomaticModelOrientation(geometry);
    return {
      mesh: name,
      evaluations: evaluations.map((e) => ({ id: e.id, rotation: e.rotation, bounds: describeBounds(e.bounds), score: e.score })),
      best: best === null ? null : best.id,
      preparation:
        preparation === null
          ? null
          : {
              candidateId: preparation.candidateId,
              rotation: preparation.rotation,
              translation: [preparation.grounding.translation.x, preparation.grounding.translation.y, preparation.grounding.translation.z],
              groundedBounds: describeBounds(preparation.grounding.groundedBounds),
              gridConfig: preparation.gridConfig,
            },
    };
  });
  expect(auto.every((a) => a.best !== null)).toBe(true);

  // applyPartOrientation's geometry steps: rotate the source geometry, ground it.
  const applied = [] as Array<{ mesh: string; orientation: PartOrientation; positions: number[]; groundedBounds: unknown; translation: number[] }>;
  const orientations: PartOrientation[] = [
    IDENTITY_PART_ORIENTATION,
    single.left!,
    composePartFlip(composePartFlip(IDENTITY_PART_ORIENTATION, "upside-down"), "forward"),
    { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
  ];
  for (const { name, geometry } of meshes) {
    const auto2 = prepareAutomaticModelOrientation(geometry)!;
    for (const orientation of [...orientations, auto2.rotation]) {
      const length = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w);
      const q = { x: orientation.x / length, y: orientation.y / length, z: orientation.z / length, w: orientation.w / length };
      const g = geometry.clone();
      g.applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const grounding = calculateModelGroundingTransform({ min: { x: b.min.x, y: b.min.y, z: b.min.z }, max: { x: b.max.x, y: b.max.y, z: b.max.z } })!;
      g.translate(grounding.translation.x, grounding.translation.y, grounding.translation.z);
      applied.push({
        mesh: name,
        orientation: q,
        positions: positionsOf(g),
        groundedBounds: describeBounds(grounding.groundedBounds),
        translation: [grounding.translation.x, grounding.translation.y, grounding.translation.z],
      });
    }
  }

  // Store behaviour with no model imported: the capability gate refuses (the reference's "Import a valid model" reason).
  const store = usePartOrientationStore.getState();
  const gated = { commit: store.commitOrientation({ x: 0, y: 0, z: 0, w: 1 }), flip: store.flipOrientation("left"), reset: store.resetOrientation() };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        meta: { generatedBy: "native/tests/reference/craftOrientationReference.test.ts", candidates: ORIENTATION_CANDIDATES },
        meshes: meshes.map(({ name, geometry }) => ({ name, positions: positionsOf(geometry) })),
        flipSingle: single,
        flipSequences,
        fromOdd,
        auto,
        applied,
        gatedWithoutModel: gated,
      },
      null,
      0,
    ),
  );
});
