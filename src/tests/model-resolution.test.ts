import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGoalModelResolution,
  evaluateGoalModelResolutionCandidates,
  parseGoalModelResolutionJson,
  parseGoalModelClassCatalog,
  parseGoalModelBindingCatalog,
} from "../index.js";

// ---------------------------------------------------------------------------
// Parsing — basic resolution
// ---------------------------------------------------------------------------

test("parses minimal valid resolution", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  assert.equal(report.status, "resolved");
  assert.equal(report.harness, "pi");
});

test("parses resolution with resolved.candidateIndex", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    resolved: { model: "placeholder/model-b", bindingSource: "pi", candidateIndex: 1 },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  assert.equal(report.resolved?.candidateIndex, 1);
  assert.equal(report.resolved?.model, "placeholder/model-b");
});

test("parses resolution with attemptedCandidates", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    resolved: { model: "placeholder/model-b", candidateIndex: 1 },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    attemptedCandidates: [
      {
        candidateIndex: 0,
        model: "placeholder/model-a",
        compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
        status: "failed",
        reason: "missing capabilities: reasoning",
      },
      {
        candidateIndex: 1,
        model: "placeholder/model-b",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "succeeded",
      },
    ],
    status: "resolved",
  });
  assert.equal(report.attemptedCandidates?.length, 2);
  assert.equal(report.attemptedCandidates?.[0]?.candidateIndex, 0);
  assert.equal(report.attemptedCandidates?.[0]?.status, "failed");
  assert.equal(report.attemptedCandidates?.[1]?.status, "succeeded");
});

test("parses resolution with switchEvents and exhaustedChain", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
    attemptedCandidates: [
      {
        candidateIndex: 0,
        model: "placeholder/model-a",
        compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
        status: "failed",
      },
      {
        candidateIndex: 1,
        model: "placeholder/model-b",
        compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
        status: "failed",
      },
    ],
    switchEvents: [
      {
        fromCandidateIndex: 0,
        fromModel: "placeholder/model-a",
        toCandidateIndex: 1,
        toModel: "placeholder/model-b",
        reason: "candidate_failed_compliance",
      },
    ],
    exhaustedChain: true,
    status: "blocked",
    reason: "all candidates exhausted",
  });
  assert.equal(report.switchEvents?.length, 1);
  assert.equal(report.switchEvents?.[0]?.reason, "candidate_failed_compliance");
  assert.equal(report.exhaustedChain, true);
  assert.equal(report.status, "blocked");
});

test("parses resolution with candidatePlan and retryPolicy", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    resolved: { model: "placeholder/model-a", candidateIndex: 0 },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    candidatePlan: [
      {
        candidateIndex: 0,
        model: "placeholder/model-a",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        eligible: true,
      },
      {
        candidateIndex: 1,
        model: "placeholder/model-b",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        eligible: true,
      },
    ],
    retryPolicy: { attemptsPerCandidate: 2 },
    status: "resolved",
  });
  assert.equal(report.candidatePlan?.length, 2);
  assert.equal(report.candidatePlan?.[1]?.model, "placeholder/model-b");
  assert.equal(report.retryPolicy?.attemptsPerCandidate, 2);
});

test("parses resolution from JSON string", () => {
  const json = JSON.stringify({
    schemaVersion: "1.0",
    harness: "pi",
    requested: { modelClass: "implementation", minimumRequirements: {} },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  const report = parseGoalModelResolutionJson(json);
  assert.equal(report.status, "resolved");
});

test("rejects resolution with unknown fields", () => {
  assert.throws(
    () => parseGoalModelResolution({ schemaVersion: "1.0", harness: "pi", requested: { modelClass: "x", minimumRequirements: {} }, compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] }, status: "resolved", extra: "bad" }),
    /extra/,
  );
});

// ---------------------------------------------------------------------------
// evaluateGoalModelResolutionCandidates
// ---------------------------------------------------------------------------

test("evaluateGoalModelResolutionCandidates resolves first capable candidate", () => {
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      implementation: {
        minimumRequirements: { reasoning: "high" },
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
          { model: "placeholder/a", declaredCapabilities: { reasoning: "medium" } },
          { model: "placeholder/b", declaredCapabilities: { reasoning: "high" } },
        ],
      },
    },
  }).bindings.implementation;

  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, 1);
  assert.equal(result.exhaustedChain, false);
  assert.equal(result.attemptedCandidates.length, 2);
  assert.equal(result.attemptedCandidates[0]?.status, "failed");
  assert.equal(result.attemptedCandidates[1]?.status, "succeeded");
  assert.equal(result.switchEvents.length, 1);
  assert.equal(result.switchEvents[0]?.fromCandidateIndex, 0);
  assert.equal(result.switchEvents[0]?.toCandidateIndex, 1);
  assert.equal(result.candidatePlan.length, 2);
  assert.equal(result.candidatePlan[0]?.eligible, false);
  assert.equal(result.candidatePlan[1]?.eligible, true);
});

test("evaluateGoalModelResolutionCandidates exhausts chain when all fail", () => {
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      implementation: {
        minimumRequirements: { reasoning: "very_high" },
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
          { model: "placeholder/a", declaredCapabilities: { reasoning: "medium" } },
          { model: "placeholder/b", declaredCapabilities: { reasoning: "high" } },
          { model: "placeholder/c", declaredCapabilities: { reasoning: "high" } },
        ],
        retryPolicy: { attemptsPerCandidate: 3 },
      },
    },
  }).bindings.implementation;

  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, undefined);
  assert.equal(result.exhaustedChain, true);
  assert.equal(result.attemptedCandidates.length, 3);
  assert.ok(result.attemptedCandidates.every((a) => a.status === "failed"));
  assert.equal(result.candidatePlan.length, 3);
  assert.ok(result.candidatePlan.every((a) => a.eligible === false));
  assert.equal(result.retryPolicy?.attemptsPerCandidate, 3);
  // 3 candidates → 2 switch events (0→1, 1→2)
  assert.equal(result.switchEvents.length, 2);
});

test("evaluateGoalModelResolutionCandidates resolves first candidate when capable", () => {
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      implementation: {
        minimumRequirements: { reasoning: "high" },
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
          { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
          { model: "placeholder/b", declaredCapabilities: { reasoning: "very_high" } },
        ],
      },
    },
  }).bindings.implementation;

  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, 0);
  assert.equal(result.exhaustedChain, false);
  assert.equal(result.attemptedCandidates.length, 1);
  assert.equal(result.attemptedCandidates[0]?.status, "succeeded");
  assert.equal(result.candidatePlan.length, 2);
  assert.equal(result.candidatePlan[0]?.eligible, true);
  assert.equal(result.candidatePlan[1]?.model, "placeholder/b");
  assert.equal(result.switchEvents.length, 0);
});

test("evaluateGoalModelResolutionCandidates accepts downgraded candidate when policy is warn", () => {
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      implementation: {
        minimumRequirements: { reasoning: "high" },
        fallbackPolicy: { allowDowngrade: true, onUnavailable: "warn" },
      },
    },
  }).modelClasses.implementation;

  const binding = parseGoalModelBindingCatalog({
    version: 2,
    harness: "pi",
    bindings: {
      implementation: {
        candidates: [
          { model: "placeholder/a", declaredCapabilities: { reasoning: "medium" } },
        ],
      },
    },
  }).bindings.implementation;

  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, 0);
  assert.equal(result.exhaustedChain, false);
  assert.equal(result.attemptedCandidates[0]?.status, "succeeded");
  assert.ok(result.attemptedCandidates[0]?.compliance.downgraded);
});

// ---------------------------------------------------------------------------
// Edge cases and error handling
// ---------------------------------------------------------------------------

test("parseGoalModelResolution rejects empty attemptedCandidates array", () => {
  assert.throws(
    () => parseGoalModelResolution({
      schemaVersion: "1.0",
      harness: "pi",
      requested: { modelClass: "x", minimumRequirements: {} },
      compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
      attemptedCandidates: [],
      status: "resolved",
    }),
    /must not be empty/,
  );
});

test("parseGoalModelResolution rejects invalid attempt status", () => {
  assert.throws(
    () => parseGoalModelResolution({
      schemaVersion: "1.0",
      harness: "pi",
      requested: { modelClass: "x", minimumRequirements: {} },
      compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
      attemptedCandidates: [{
        candidateIndex: 0,
        model: "placeholder/a",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "unknown",
      }],
      status: "resolved",
    }),
    /expected one of/,
  );
});

test("parseGoalModelResolution rejects negative candidateIndex", () => {
  assert.throws(
    () => parseGoalModelResolution({
      schemaVersion: "1.0",
      harness: "pi",
      requested: { modelClass: "x", minimumRequirements: {} },
      compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
      resolved: { model: "placeholder/a", candidateIndex: -1 },
      status: "resolved",
    }),
    /non-negative integer/,
  );
});
