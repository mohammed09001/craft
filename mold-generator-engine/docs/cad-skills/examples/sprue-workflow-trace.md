# CAD Skill System Workflow Trace: Sprue Generation (Partial Revision Scenario)

This trace demonstrates a token-efficient **Partial Revision** workflow for an existing **Sprue** CAD feature.

---

## Phase 1: User Request & Skill 0 Routing

### Input User Prompt:
> "Revise only the rebuild triggers of the existing sprue algorithm specification to invalidate when the top-face clearance margin changes."

### Skill 0 Routing Decision Output (`RoutingDecision`):
```json
{
  "intent": "REVISE_SPRUE_REBUILD_TRIGGERS",
  "targetFeature": "Sprue",
  "taskType": "DESIGN_REVISION",
  "executionMode": "SINGLE",
  "updateMode": "PARTIAL_UPDATE",
  "selectedSkills": [
    "cad-algorithm-designer"
  ],
  "contextBudget": {
    "requiredFiles": ["docs/cad-skills/contracts/skill-1-designer.schema.json"],
    "requiredDocSections": ["Sprue Algorithm Specification"],
    "requiredPriorOutputs": ["ALG-SPRUE-001"],
    "excludedContext": ["frontend/src/*", "src/*"],
    "maxRecommendedContextScope": "Existing artifact ALG-SPRUE-001 and prompt only",
    "repositoryInspectionRequired": false,
    "promptInformationSufficient": true
  },
  "workflowControls": {
    "maxWorkflowSteps": 1,
    "completionCondition": "Valid partial update artifact produced for ALG-SPRUE-001",
    "failureCondition": "Schema validation failure",
    "requiredOutputContract": "AlgorithmSpecification",
    "validationGate": "Schema validation and metadata revision increment pass",
    "resumeFromArtifact": "ALG-SPRUE-001",
    "invalidationTriggers": ["Top face clearance margin modification"]
  },
  "executionOrder": [
    {
      "step": 1,
      "skill": "cad-algorithm-designer",
      "purpose": "Perform partial update to rebuild triggers of ALG-SPRUE-001",
      "inputSource": "ALG-SPRUE-001 + userPrompt",
      "artifactAction": "PARTIAL_UPDATE"
    }
  ],
  "selectionReasoning": "Request modifies only section 10 of existing accepted artifact ALG-SPRUE-001. Skill 1 in PARTIAL_UPDATE mode is sufficient; geometry strategy (Skill 2) remains valid and unchanged."
}
```

---

## Phase 2: Skill 1 Execution (CAD Algorithm Designer - PARTIAL_UPDATE Mode)

### Skill 1 Partial Output (`AlgorithmSpecification`):
```json
{
  "metadata": {
    "artifactId": "ALG-SPRUE-002",
    "artifactType": "AlgorithmSpecification",
    "artifactVersion": "1.1.0",
    "revision": 2,
    "authorSkill": "cad-algorithm-designer",
    "status": "ACCEPTED",
    "detailLevel": "COMPACT",
    "updateMode": "PARTIAL_UPDATE",
    "sourcePromptSummary": "Revise rebuild triggers to include top-face clearance margin changes",
    "dependencyIds": ["ALG-SPRUE-001"],
    "supersedesArtifactId": "ALG-SPRUE-001",
    "invalidationTriggers": ["Top face clearance margin modification", "Mold block dimension change"]
  },
  "featureName": "Sprue",
  "changedSections": ["10_rebuildTriggers"],
  "specification": {
    "1_problemDefinition": { "ref": "ALG-SPRUE-001.specification.1_problemDefinition" },
    "2_inputs": { "ref": "ALG-SPRUE-001.specification.2_inputs" },
    "3_outputs": { "ref": "ALG-SPRUE-001.specification.3_outputs" },
    "4_constraints": { "ref": "ALG-SPRUE-001.specification.4_constraints" },
    "5_userInteraction": { "ref": "ALG-SPRUE-001.specification.5_userInteraction" },
    "6_algorithmPipeline": [ { "ref": "ALG-SPRUE-001.specification.6_algorithmPipeline" } ],
    "7_failureConditions": [ { "ref": "ALG-SPRUE-001.specification.7_failureConditions" } ],
    "8_edgeCases": [ { "ref": "ALG-SPRUE-001.specification.8_edgeCases" } ],
    "9_dependencies": { "ref": "ALG-SPRUE-001.specification.9_dependencies" },
    "10_rebuildTriggers": [
      "Mold block clearance dimension change",
      "Cavity pull direction change",
      "Sprue position drag event",
      "Top-face clearance margin modification (ADDED in Rev 2)"
    ],
    "11_stateTransitions": { "ref": "ALG-SPRUE-001.specification.11_stateTransitions" }
  },
  "decisionClassifications": [
    { "item": "Top-face clearance margin rebuild trigger", "classification": "ENGINEERING_DECISION" }
  ]
}
```

*Note: In `PARTIAL_UPDATE` mode, Skill 1 outputs full content ONLY for `10_rebuildTriggers`, using lightweight references for unchanged sections. This achieves ~80% token savings while maintaining complete structural integrity.*
