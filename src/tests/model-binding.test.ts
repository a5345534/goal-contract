import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGoalModelBindingCandidateChainCompliance,
  getGoalModelBindingCandidates,
  normalizeGoalModelBinding,
  parseGoalModelBindingCatalog,
  parseGoalModelClassCatalog,
  parseNormalizedGoalModelBindingCatalog,
} from "../index.js";

test("normalizes legacy single-model bindings to a one-candidate chain", () => {
  const catalog = parseNormalizedGoalModelBindingCatalog({
    version: 1,
    harness: "pi",
    bindings: {
      implementation: {
        model: "placeholder/model-a",
        declaredCapabilities: { reasoning: "high", toolUse: "required" },
        notes: "legacy binding note",
      },
    },
  });

  assert.equal(catalog.version, 1);
  assert.equal(catalog.bindings.implementation.candidates.length, 1);
  assert.deepEqual(catalog.bindings.implementation.candidates[0], {
    model: "placeholder/model-a",
    declaredCapabilities: { reasoning: "high", toolUse: "required" },
    notes: "legacy binding note",
  });
});

test("parses version 2 ordered candidate chains with retry policy", () => {
  const catalog = parseGoalModelBindingCatalog({
    version: 2,
    harness: "pi",
    bindings: {
      implementation: {
        candidates: [
          { model: "placeholder/model-a", declaredCapabilities: { reasoning: "high", toolUse: "required" } },
          { model: "placeholder/model-b", declaredCapabilities: { reasoning: "medium", toolUse: "required" }, notes: "fallback" },
        ],
        retryPolicy: { attemptsPerCandidate: 2 },
        notes: "operator ordered fallback chain",
      },
    },
  });

  const normalized = normalizeGoalModelBinding(catalog.bindings.implementation);
  assert.deepEqual(getGoalModelBindingCandidates(catalog.bindings.implementation).map((candidate) => candidate.model), [
    "placeholder/model-a",
    "placeholder/model-b",
  ]);
  assert.equal(normalized.retryPolicy?.attemptsPerCandidate, 2);
  assert.equal(normalized.notes, "operator ordered fallback chain");
});

test("version 2 catalogs may still contain legacy single-model bindings", () => {
  const catalog = parseNormalizedGoalModelBindingCatalog({
    version: 2,
    harness: "pi",
    bindings: {
      spark: { model: "placeholder/fast", declaredCapabilities: { reasoning: "low" } },
    },
  });

  assert.equal(catalog.bindings.spark.candidates[0]?.model, "placeholder/fast");
});

test("rejects empty candidate chains fail-closed", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: { implementation: { candidates: [] } },
    }),
    /candidates must not be empty/,
  );
});

test("rejects candidate chains in version 1 catalogs fail-closed", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 1,
      harness: "pi",
      bindings: {
        implementation: {
          candidates: [{ model: "placeholder/model-a", declaredCapabilities: { reasoning: "high" } }],
        },
      },
    }),
    /requires catalog version 2/,
  );
});

test("rejects invalid candidate chain entries and retry policies", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        implementation: {
          candidates: [{ model: " ", declaredCapabilities: { reasoning: "high" } }],
        },
      },
    }),
    /expected non-empty string/,
  );

  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        implementation: {
          candidates: [{ model: "placeholder/model-a", declaredCapabilities: { reasoning: "high" } }],
          retryPolicy: { attemptsPerCandidate: 0 },
        },
      },
    }),
    /positive integer/,
  );
});

test("evaluates compliance independently for each candidate", () => {
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      implementation: {
        minimumRequirements: { reasoning: "high", toolUse: "required" },
        fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
      },
    },
  }).modelClasses.implementation;
  const binding = parseGoalModelBindingCatalog({
    version: 2,
    harness: "pi",
    bindings: {
      implementation: {
        candidates: [
          { model: "placeholder/under-capable", declaredCapabilities: { reasoning: "medium", toolUse: "required" } },
          { model: "placeholder/capable", declaredCapabilities: { reasoning: "high", toolUse: "required" } },
        ],
      },
    },
  }).bindings.implementation;

  const compliance = evaluateGoalModelBindingCandidateChainCompliance(modelClass, binding);
  assert.deepEqual(compliance.map((candidate) => [candidate.candidateIndex, candidate.model, candidate.status, candidate.missingCapabilities]), [
    [0, "placeholder/under-capable", "blocked", ["reasoning"]],
    [1, "placeholder/capable", "resolved", []],
  ]);
});
