import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalDagFileContent, parseGoalDagFileDocument } from "../goal-dag-parser.js";
import { resolveGoalQualityProfiles } from "../goal-dag-types.js";
import { SUPPORTED_REQUIRED_EVIDENCE } from "../validation-evidence.js";

const minimalDag = {
  version: 1,
  objective: "Test goal",
  nodes: [{ id: "node-a", objective: "Do work" }],
};

const validDag = {
  version: 1,
  objective: "Complete backend slices",
  modelRouting: {
    scenarios: {
      controller: { modelClass: "controller" },
      implementation: { modelClass: "implementation" },
    },
    controllerScenario: "controller",
  },
  nodes: [
    {
      id: "attendance-parity",
      objective: "Add attendance parity",
      modelScenario: "implementation",
      risk: "medium" as const,
      validation: {
        requiredEvidence: ["validators-ran", "implementation-diff-present"],
      },
    },
    {
      id: "integration-validation",
      objective: "Run validation",
      after: ["attendance-parity"],
      validators: ["npm test"],
      validation: {
        requiredEvidence: ["validators-ran"],
        allowedPaths: ["src/**"],
        forbiddenPaths: ["infra/**"],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

test("accepts minimal valid DAG", () => {
  const doc = parseGoalDagFileDocument(minimalDag);
  assert.equal(doc.version, 1);
  assert.equal(doc.nodes.length, 1);
});

test("accepts minimal valid DAG JSON string", () => {
  const doc = parseGoalDagFileContent(JSON.stringify(minimalDag));
  assert.equal(doc.objective, "Test goal");
});

test("accepts DAG with all supported requiredEvidence tokens", () => {
  const dag = {
    version: 1,
    objective: "x",
    nodes: [{
      id: "a",
      objective: "x",
      validation: {
        requiredEvidence: [...SUPPORTED_REQUIRED_EVIDENCE],
      },
    }],
  };
  const doc = parseGoalDagFileDocument(dag);
  assert.deepEqual(doc.nodes[0].validation?.requiredEvidence, [...SUPPORTED_REQUIRED_EVIDENCE]);
});

test("accepts full valid DAG with defaults and model routing", () => {
  const dag = {
    version: 1,
    objective: "Full DAG",
    defaults: {
      workspaceStrategy: "native-git-worktree",
      completionGates: ["controller-validation"],
      thinkingLevel: "high",
      qualityProfiles: ["incremental-implementation", "test-driven-change"],
    },
    modelRouting: {
      scenarios: {
        controller: { modelClass: "controller" },
        implementation: { modelClass: "implementation" },
      },
    },
    nodes: [
      {
        id: "node-a",
        objective: "A",
        workspace: { worktreeSlug: "node-a" },
        risk: "high",
        qualityProfiles: ["code-review-required"],
      },
      {
        id: "node-b",
        objective: "B",
        after: ["node-a"],
        validators: ["echo ok"],
        validation: {
          profile: "code-change",
          requiredEvidence: ["validators-ran"],
          artifactLocks: [{
            path: "tests/a.test.ts",
            sha256: "0000000000000000000000000000000000000000000000000000000000000000",
          }],
        },
      },
    ],
  };
  const doc = parseGoalDagFileDocument(dag);
  assert.equal(doc.defaults?.thinkingLevel, "high");
  assert.deepEqual(doc.defaults?.qualityProfiles, ["incremental-implementation", "test-driven-change"]);
  assert.deepEqual(doc.nodes[0].qualityProfiles, ["code-review-required"]);
  assert.equal(doc.nodes.length, 2);
  assert.equal(doc.nodes[1].after?.length, 1);
});

test("resolves quality profiles from defaults and node with stable de-duplication", () => {
  assert.deepEqual(
    resolveGoalQualityProfiles(
      { qualityProfiles: ["incremental-implementation", "test-driven-change"] },
      { qualityProfiles: ["test-driven-change", "code-review-required"] },
    ),
    ["incremental-implementation", "test-driven-change", "code-review-required"],
  );
  assert.deepEqual(
    resolveGoalQualityProfiles(
      ["docs-required", "ship-preflight"],
      ["docs-required", "observability-required"],
    ),
    ["docs-required", "ship-preflight", "observability-required"],
  );
});

// ---------------------------------------------------------------------------
// Rejection: structure
// ---------------------------------------------------------------------------

test("rejects duplicate node ids", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [
        { id: "a", objective: "x" },
        { id: "a", objective: "y" },
      ],
    }),
    /duplicate node id/,
  );
});

test("rejects missing dependency", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", after: ["missing"] }],
    }),
    /missing node/,
  );
});

test("rejects self dependency", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", after: ["a"] }],
    }),
    /depends on itself/,
  );
});

test("rejects cycle", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [
        { id: "a", objective: "x", after: ["b"] },
        { id: "b", objective: "y", after: ["a"] },
      ],
    }),
    /cycle/,
  );
});

test("rejects non-kebab-case node id", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "Bad_Id", objective: "x" }],
    }),
    /kebab-case/,
  );
});

test("rejects version !== 1", () => {
  assert.throws(
    () => parseGoalDagFileDocument({ ...minimalDag, version: 2 }),
    /version must be 1/,
  );
});

test("rejects empty objective", () => {
  assert.throws(
    () => parseGoalDagFileDocument({ version: 1, objective: "", nodes: [{ id: "a", objective: "x" }] }),
    /non-empty/,
  );
});

test("rejects empty nodes", () => {
  assert.throws(
    () => parseGoalDagFileDocument({ version: 1, objective: "x", nodes: [] }),
    /nodes/,
  );
});

test("rejects malformed JSON string", () => {
  assert.throws(() => parseGoalDagFileContent("{bad"), /JSON/);
});

test("rejects unknown root keys", () => {
  assert.throws(
    () => parseGoalDagFileDocument({ ...minimalDag, trace: {} }),
    /unsupported field/,
  );
});

test("rejects unknown node keys", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", produces: [] }],
    }),
    /unsupported field/,
  );
});

// ---------------------------------------------------------------------------
// Rejection: qualityProfiles
// ---------------------------------------------------------------------------

test("rejects unsupported qualityProfiles", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      defaults: { qualityProfiles: ["unsupported-profile"] },
      nodes: [{ id: "a", objective: "x" }],
    }),
    /quality profile/,
  );
});

test("rejects duplicate qualityProfiles", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", qualityProfiles: ["docs-required", "docs-required"] }],
    }),
    /duplicate quality profile/,
  );
});

test("rejects empty qualityProfiles", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", qualityProfiles: [] }],
    }),
    /qualityProfiles.*must not be empty/,
  );
});

// ---------------------------------------------------------------------------
// Rejection: requiredEvidence
// ---------------------------------------------------------------------------

test("rejects unsupported requiredEvidence", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", validation: { requiredEvidence: ["pnpm test passes"] } }],
    }),
    /requiredEvidence/,
  );
});

test("rejects duplicate requiredEvidence", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", validation: { requiredEvidence: ["validators-ran", "validators-ran"] } }],
    }),
    /duplicate/,
  );
});

// ---------------------------------------------------------------------------
// Rejection: model scenario
// ---------------------------------------------------------------------------

test("rejects unknown modelScenario", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      modelRouting: { scenarios: { docs: { modelClass: "implementation" } } },
      nodes: [{ id: "a", objective: "x", modelScenario: "missing" }],
    }),
    /unknown model scenario/,
  );
});

// ---------------------------------------------------------------------------
// Rejection: validation metadata
// ---------------------------------------------------------------------------

test("rejects invalid artifact lock sha256", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{
        id: "a",
        objective: "x",
        validation: {
          artifactLocks: [{ path: "tests/a.test.ts", sha256: "not-a-sha" }],
        },
      }],
    }),
    /sha256/,
  );
});

test("rejects invalid workspace binding", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{
        id: "a",
        objective: "x",
        workspace: {},
      }],
    }),
    /must set worktreeSlug/,
  );
});

test("rejects invalid risk value", () => {
  assert.throws(
    () => parseGoalDagFileDocument({
      version: 1,
      objective: "x",
      nodes: [{ id: "a", objective: "x", risk: "extreme" }],
    }),
    /risk/,
  );
});
