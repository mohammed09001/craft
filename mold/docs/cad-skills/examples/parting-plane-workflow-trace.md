# CAD Skill System Workflow Trace: Parting Plane Analysis (Sequential Flow)

This trace demonstrates a **Sequential Multi-Skill** workflow for generating a **Parting Plane** CAD feature.

---

## Phase 1: User Request & Skill 0 Routing

### Input User Prompt:
> "Determine the optimal parting plane location and split loop for the imported part geometry along the Z-axis pull direction, then select the computational geometry method."

### Skill 0 Routing Decision Output (`RoutingDecision`):
```json
{
  "intent": "EVALUATE_PARTING_PLANE_FULL",
  "targetFeature": "Parting Plane",
  "taskType": "NEW_DESIGN",
  "executionMode": "SEQUENTIAL",
  "updateMode": "FULL",
  "selectedSkills": [
    "cad-algorithm-designer",
    "geometry-computational-specialist"
  ],
  "contextBudget": {
    "requiredFiles": ["docs/cad-skills/contracts/skill-1-designer.schema.json", "docs/cad-skills/contracts/skill-2-geometry.schema.json"],
    "requiredDocSections": ["Parting Plane Specification"],
    "requiredPriorOutputs": [],
    "excludedContext": ["frontend/src/*", "src/*"],
    "maxRecommendedContextScope": "Feature prompt and contract schemas only",
    "repositoryInspectionRequired": false,
    "promptInformationSufficient": true
  },
  "workflowControls": {
    "maxWorkflowSteps": 2,
    "completionCondition": "Valid GeometryStrategySpecification produced referencing accepted AlgorithmSpecification",
    "failureCondition": "Schema validation failure",
    "requiredOutputContract": "GeometryStrategySpecification",
    "validationGate": "Schema validation and contract compatibility pass",
    "resumeFromArtifact": null,
    "invalidationTriggers": ["Part orientation change", "Pull direction modification"]
  },
  "executionOrder": [
    {
      "step": 1,
      "skill": "cad-algorithm-designer",
      "purpose": "Define problem, inputs, outputs, pipeline, and state transitions",
      "inputSource": "userPrompt",
      "artifactAction": "FULL"
    },
    {
      "step": 2,
      "skill": "geometry-computational-specialist",
      "purpose": "Select computational geometry data structures (Half-Edge, AABB-Tree, Silhouette extraction)",
      "inputSource": "step_1.output",
      "artifactAction": "FULL"
    }
  ],
  "selectionReasoning": "Parting Plane derivation requires a full algorithmic specification followed by geometric silhouette edge extraction and plane slicing strategy."
}
```

---

## Phase 2: Skill 1 Execution (CAD Algorithm Designer)

### Skill 1 Output (`AlgorithmSpecification`):
```json
{
  "metadata": {
    "artifactId": "ALG-PARTING-001",
    "artifactType": "AlgorithmSpecification",
    "artifactVersion": "1.0.0",
    "revision": 1,
    "authorSkill": "cad-algorithm-designer",
    "status": "ACCEPTED",
    "detailLevel": "STANDARD",
    "updateMode": "FULL",
    "sourcePromptSummary": "Derive optimal parting plane location and split loop along Z pull direction",
    "dependencyIds": [],
    "supersedesArtifactId": null,
    "invalidationTriggers": ["Part orientation change", "Pull direction modification"]
  },
  "featureName": "Parting Plane",
  "changedSections": [],
  "specification": {
    "1_problemDefinition": {
      "goal": "Identify silhouette boundary curve dividing positive and negative draft surfaces and construct a continuous parting surface.",
      "cadContext": "Defines the splitting interface between core and cavity mold halves.",
      "expectedOutcome": "Closed parting loop 3D curve and planar/ruled surface dividing the mold block."
    },
    "2_inputs": {
      "userParameters": ["pullDirection Vector3 (default: [0, 0, 1])", "draftAngleThresholdDeg (default: 0.0)"],
      "canonicalStateDependencies": ["ImportedPartModel.meshGeometry"],
      "referenceUnits": "mm (Millimeters)",
      "coordinateSystem": "Z-up"
    },
    "3_outputs": {
      "derivedGeometry": ["partingLoopCurve", "partingSurfaceMesh"],
      "canonicalStateUpdates": ["PartingPlaneDefinition"],
      "downstreamArtifacts": ["CoreCavitySplitBoundary"]
    },
    "4_constraints": {
      "geometricConstraints": ["Parting curve must form a continuous non-self-intersecting closed loop"],
      "topologicalConstraints": ["Loop must partition mesh faces into strictly positive and negative draft sets"],
      "performanceConstraints": ["Silhouette extraction < 100ms for 100k triangle mesh"]
    },
    "5_userInteraction": {
      "viewportTools": ["Height plane slider handle", "Interactive parting curve visualizer"],
      "interactionEvents": ["PlaneHeightDrag", "PullDirectionToggle"],
      "feedbackMechanisms": ["Draft angle heat map (red = undercut, green = positive, blue = negative)"]
    },
    "6_algorithmPipeline": [
      { "phase": "Pre-Processing", "description": "Compute face normals relative to pull direction vector V_pull." },
      { "phase": "Core Evaluation", "description": "Identify silhouette edges where N1.V >= 0 and N2.V < 0; chain into closed loop." },
      { "phase": "Post-Processing", "description": "Extrude silhouette loop outwards to mold block bounding box to form parting surface." }
    ],
    "7_failureConditions": [
      { "condition": "Discontinuous silhouette loop due to vertical faces or undercuts", "errorCode": "PARTING_LOOP_DISCONTINUOUS", "recoveryAction": "Prompt user for manual bridge curves or adjust pull direction." }
    ],
    "8_edgeCases": [
      { "scenario": "Vertical faces parallel to pull direction (N.V = 0)", "mitigation": "Assign vertical faces to cavity or core based on adjacent face curvature continuity." }
    ],
    "9_dependencies": {
      "upstreamStages": ["Part Grounding & Orientation Stage"],
      "runtimeServices": ["HalfEdgeTopologyService"],
      "externalLibraries": ["Three.js", "manifold-3d"]
    },
    "10_rebuildTriggers": ["Part orientation change", "Pull direction modification"],
    "11_stateTransitions": {
      "states": ["UNINITIALIZED", "ANALYZING_DRAFT", "LOOP_DERIVED", "SURFACE_GENERATED", "STALE", "ERROR"],
      "transitions": ["UNINITIALIZED --(Start)--> ANALYZING_DRAFT", "ANALYZING_DRAFT --(Loop Extracted)--> LOOP_DERIVED", "LOOP_DERIVED --(Surface Extruded)--> SURFACE_GENERATED"]
    }
  },
  "decisionClassifications": [
    { "item": "Z-up pull direction default [0, 0, 1]", "classification": "EXISTING_PROJECT_CONSTRAINT" },
    { "item": "Parting loop continuity requirement", "classification": "ENGINEERING_DECISION" }
  ]
}
```

---

## Phase 3: Skill 2 Execution (Geometry & Computational Specialist)

### Skill 2 Output (`GeometryStrategySpecification`):
```json
{
  "metadata": {
    "artifactId": "GEO-PARTING-001",
    "artifactType": "GeometryStrategySpecification",
    "artifactVersion": "1.0.0",
    "revision": 1,
    "authorSkill": "geometry-computational-specialist",
    "status": "ACCEPTED",
    "detailLevel": "STANDARD",
    "updateMode": "FULL",
    "sourceAlgorithmArtifactId": "ALG-PARTING-001",
    "dependencyIds": ["ALG-PARTING-001"],
    "supersedesArtifactId": null,
    "invalidationTriggers": ["Part orientation change", "Pull direction modification"]
  },
  "featureName": "Parting Plane",
  "changedSections": [],
  "geometryDecisionRecord": {
    "selectedStrategy": "Half-Edge Topology Edge Normal Dot Product Classification with AABB Ruled Extrusion",
    "selectedStrategyReasons": [
      "Half-Edge topology structure allows O(1) neighbor face lookup required to classify silhouette edges across face boundaries",
      "AABB Tree accelerates ray-plane intersection checks during manual loop bridging"
    ],
    "decisionConfidence": "HIGH",
    "criticalAssumptions": [
      "Input part mesh is a 2-manifold closed surface"
    ],
    "numericalTolerancePolicy": {
      "absoluteDistanceToleranceMm": 0.0001,
      "angularToleranceRad": 0.001,
      "coplanarThresholdMm": 0.00001,
      "boundingBoxEpsilonMm": 0.001
    },
    "robustnessRequirements": [
      "Angular 1e-4 rad perturbation to pull vector if large numbers of faces are perpendicular to pull direction",
      "Stitch non-adjacent silhouette segments within 1e-3mm snapping radius"
    ],
    "rejectedStrategies": [
      {
        "strategy": "Pure Planar Bounding Box Slicing",
        "rejectionReason": "Ignores complex 3D part parting lines and creates severe undercuts on curved parts",
        "plausibility": "HIGH"
      }
    ],
    "reviewRequired": false,
    "validationRequirements": [
      "Closed loop continuity check",
      "Draft angle classification verification"
    ]
  },
  "geometryStrategy": {
    "representationParadigm": {
      "primaryFormat": "Mesh",
      "topologyStructure": "Half-Edge Data Structure",
      "justification": "Half-Edge structure allows O(1) neighbor face lookup required to classify silhouette edges across face boundaries."
    },
    "spatialIndexing": {
      "chosenStructure": "AABB Tree",
      "purpose": "Fast ray-plane intersection checks during manual loop bridging and surface extension.",
      "buildComplexity": "O(N log N)",
      "queryComplexity": "O(log N)"
    },
    "geometricOperations": [
      {
        "operation": "Silhouette Edge Extraction",
        "technique": "Dot Product Normal Classification across Half-Edges",
        "mathFormulation": "Edge E is silhouette iff (N_left.V_pull) * (N_right.V_pull) <= 0",
        "inputPrimitives": "Half-Edge Mesh, Vector3 V_pull",
        "outputPrimitives": "Ordered Polyline Loop"
      }
    ],
    "coordinateTransforms": {
      "workingFrame": "World Coordinate System (WCS)",
      "transformationMatrix": "Identity Matrix",
      "normalAlignment": "Z-axis aligned [0, 0, 1]"
    },
    "numericalTolerances": {
      "absoluteDistanceToleranceMm": 0.0001,
      "angularToleranceRad": 0.001,
      "coplanarThresholdMm": 0.00001,
      "boundingBoxEpsilonMm": 0.001
    },
    "robustnessStrategy": {
      "coplanarFaceHandling": "Apply 1e-4 rad angular perturbation to pull vector if faces are perpendicular to pull direction.",
      "degenerateTopologyRepair": "Stitch non-adjacent silhouette segments within 1e-3mm snapping radius.",
      "manifoldGuarantee": "Enforce boundary manifoldness on extended parting surface mesh."
    }
  }
}
```
