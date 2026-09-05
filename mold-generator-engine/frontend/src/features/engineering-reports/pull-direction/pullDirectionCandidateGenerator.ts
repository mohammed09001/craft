import {
  type PullDirectionAnalysisVector3,
  type PullDirectionCandidateDirection,
  type PullDirectionCandidateGenerationResult,
  type PullDirectionCandidateGenerator,
} from "./pullDirectionAnalysisEngine.contracts";

const createCandidate = (
  id: string,
  label: string,
  vector: PullDirectionAnalysisVector3,
): PullDirectionCandidateDirection => ({
  id,
  label,
  vector,
  source: "canonical-axis-seed",
  strategy: "canonical-axis-seed",
  coordinateSystem: "model-space",
  requiresGeometryInspection: false,
  score: null,
  rank: null,
});

const createCanonicalAxisSeedCandidates = (): readonly PullDirectionCandidateDirection[] => [
  createCandidate("pull-direction-candidate-positive-x", "+X", { x: 1, y: 0, z: 0 }),
  createCandidate("pull-direction-candidate-negative-x", "-X", { x: -1, y: 0, z: 0 }),
  createCandidate("pull-direction-candidate-positive-y", "+Y", { x: 0, y: 1, z: 0 }),
  createCandidate("pull-direction-candidate-negative-y", "-Y", { x: 0, y: -1, z: 0 }),
  createCandidate("pull-direction-candidate-positive-z", "+Z", { x: 0, y: 0, z: 1 }),
  createCandidate("pull-direction-candidate-negative-z", "-Z", { x: 0, y: 0, z: -1 }),
];

export const createCanonicalAxisSeedCandidateGenerator = (): PullDirectionCandidateGenerator => ({
  generate: (): PullDirectionCandidateGenerationResult => ({
    strategy: "canonical-axis-seed",
    candidates: createCanonicalAxisSeedCandidates(),
    inspectedMesh: false,
    inspectedFaceNormals: false,
    computedScores: false,
    selectedBestDirection: false,
  }),
});
