/**
 * Edge-case tests for goal-contract model binding and resolution covering:
 *  1. Legacy bindings — v1 single-model binding normalization & compliance
 *  2. Candidate chains — chain parsing, normalization, compliance evaluation
 *  3. Invalid/empty candidates — reject invalid catalog and candidate shapes
 *  4. Under-capable candidates — each capability dimension, multiple deficits
 *  5. Model fallback evidence serialization — resolution evidence round-trip,
 *     all attempt statuses, reason fields, full evidence payload
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  // binding
  normalizeGoalModelBinding,
  normalizeGoalModelBindingCatalog,
  parseGoalModelBindingCatalog,
  parseNormalizedGoalModelBindingCatalog,
  evaluateGoalModelBindingCompliance,
  evaluateGoalModelBindingCandidateChainCompliance,
  getGoalModelBindingCandidates,
  // model class
  parseGoalModelClassCatalog,
  // resolution
  parseGoalModelResolution,
  parseGoalModelResolutionJson,
  evaluateGoalModelResolutionCandidates,
  // types
  type GoalModelBinding,
  type GoalModelSingleBinding,
  type GoalModelCandidateChainBinding,
  type GoalModelResolutionAttemptedCandidate,
} from "../index.js";

// --------------------------------------------------------------------------
// Helper – reusable model class catalog fixture
// --------------------------------------------------------------------------

const CAPABLE_MODEL_CLASSES = parseGoalModelClassCatalog({
  version: 1,
  modelClasses: {
    full: {
      minimumRequirements: {
        reasoning: "high",
        contextWindowTokens: 128000,
        toolUse: "required",
        structuredOutput: "preferred",
        formatFollowing: "medium",
        sourceCitation: "preferred",
        privacy: "cloud-ok",
      },
      fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
    },
    strict: {
      minimumRequirements: { reasoning: "very_high", toolUse: "required" },
      fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
    },
    "warn-policy": {
      minimumRequirements: { reasoning: "very_high" },
      fallbackPolicy: { allowDowngrade: true, onUnavailable: "warn" },
    },
    "fallback-impl": {
      minimumRequirements: { reasoning: "very_high" },
      fallbackPolicy: { allowDowngrade: true, onUnavailable: "fallback-to-implementation" },
    },
    "block-downgrade": {
      minimumRequirements: { reasoning: "very_high" },
      fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
    },
  },
}).modelClasses;

// ==========================================================================
// 1. Legacy bindings
// ==========================================================================

test("legacy v1 binding normalizes to single-candidate chain", () => {
  const legacy: GoalModelSingleBinding = {
    model: "placeholder/model-a",
    declaredCapabilities: { reasoning: "high", toolUse: "required" },
    notes: "legacy",
  };
  const normalized = normalizeGoalModelBinding(legacy);
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.candidates[0]?.model, "placeholder/model-a");
  assert.equal(normalized.candidates[0]?.notes, "legacy");
});

test("legacy v1 binding without notes normalizes cleanly", () => {
  const legacy: GoalModelSingleBinding = {
    model: "placeholder/model-a",
    declaredCapabilities: { reasoning: "low" },
  };
  const normalized = normalizeGoalModelBinding(legacy);
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.candidates[0]?.notes, undefined);
});

test("legacy v1 catalog round-trip through normalizeGoalModelBindingCatalog", () => {
  const catalog = parseNormalizedGoalModelBindingCatalog({
    version: 1,
    harness: "pi",
    bindings: {
      controller: {
        model: "placeholder/legacy-ctl",
        declaredCapabilities: { reasoning: "very_high", contextWindowTokens: 256000, toolUse: "required" },
      },
    },
  });
  assert.equal(catalog.version, 1);
  assert.equal(catalog.harness, "pi");
  assert.equal(catalog.bindings.controller.candidates.length, 1);
  assert.equal(catalog.bindings.controller.candidates[0]?.model, "placeholder/legacy-ctl");
});

test("evaluateGoalModelBindingCompliance on legacy candidate passes when capable", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/capable",
    declaredCapabilities: { reasoning: "very_high", toolUse: "required" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES.strict, binding);
  assert.equal(result.status, "resolved");
  assert.equal(result.satisfiesMinimum, true);
  assert.equal(result.downgraded, false);
});

test("evaluateGoalModelBindingCompliance on legacy candidate blocks when under-capable", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/weak",
    declaredCapabilities: { reasoning: "low", toolUse: "optional" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES.strict, binding);
  assert.equal(result.status, "blocked");
  assert.equal(result.satisfiesMinimum, false);
  assert.deepEqual(result.missingCapabilities, ["reasoning", "toolUse"]);
});

// ==========================================================================
// 2. Candidate chains
// ==========================================================================

test("chain binding normalizes with single candidate and no retry", () => {
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
    ],
    notes: "single fallback",
  };
  const normalized = normalizeGoalModelBinding(chain);
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.notes, "single fallback");
  assert.equal(normalized.retryPolicy, undefined);
});

test("chain binding normalizes with retry policy and no notes", () => {
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "medium" } },
    ],
    retryPolicy: { attemptsPerCandidate: 3 },
  };
  const normalized = normalizeGoalModelBinding(chain);
  assert.equal(normalized.candidates.length, 2);
  assert.equal(normalized.retryPolicy?.attemptsPerCandidate, 3);
  assert.equal(normalized.notes, undefined);
});

test("getGoalModelBindingCandidates returns all chain candidates", () => {
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "medium" } },
      { model: "placeholder/c", declaredCapabilities: { reasoning: "low" } },
    ],
  };
  const models = getGoalModelBindingCandidates(chain).map((c) => c.model);
  assert.deepEqual(models, ["placeholder/a", "placeholder/b", "placeholder/c"]);
});

test("chain compliance: all candidates capable, first wins", () => {
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high", contextWindowTokens: 128000, toolUse: "required", structuredOutput: "preferred", formatFollowing: "medium", sourceCitation: "preferred", privacy: "cloud-ok" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "high", contextWindowTokens: 128000, toolUse: "required", structuredOutput: "preferred", formatFollowing: "medium", sourceCitation: "preferred", privacy: "cloud-ok" } },
    ],
  };
  const result = evaluateGoalModelBindingCandidateChainCompliance(CAPABLE_MODEL_CLASSES.full, chain);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.status, "resolved");
  assert.equal(result[1]?.status, "resolved");
  // Both capable → both resolved, but first-match-wins in resolution
  assert.equal(result[0]?.satisfiesMinimum, true);
  assert.equal(result[1]?.satisfiesMinimum, true);
});

test("chain compliance: partial capability chain with notes", () => {
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "medium", contextWindowTokens: 128000, toolUse: "optional", structuredOutput: "preferred", formatFollowing: "medium", sourceCitation: "preferred", privacy: "cloud-ok" }, notes: "weak" },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "high", contextWindowTokens: 128000, toolUse: "required", structuredOutput: "preferred", formatFollowing: "medium", sourceCitation: "preferred", privacy: "cloud-ok" }, notes: "capable" },
    ],
  };
  const result = evaluateGoalModelBindingCandidateChainCompliance(CAPABLE_MODEL_CLASSES.full, chain);
  assert.equal(result[0]?.status, "blocked");
  assert.equal(result[1]?.status, "resolved");
  assert.deepEqual(result[0]?.missingCapabilities, ["reasoning", "toolUse"]);
  assert.equal(result[0]?.model, "placeholder/a");
  assert.equal(result[1]?.model, "placeholder/b");
});

// ==========================================================================
// 3. Invalid / empty candidates
// ==========================================================================

test("rejects catalog with empty bindings object", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 1,
      harness: "pi",
      bindings: {},
    }),
    /must not be empty/,
  );
});

test("rejects binding catalog with invalid binding id", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 1,
      harness: "pi",
      bindings: {
        "Bad_Id": { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
      },
    }),
    /must match/,
  );
});

test("rejects candidate with whitespace-only model", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        "valid-id": {
          candidates: [
            { model: "   ", declaredCapabilities: { reasoning: "high" } },
          ],
        },
      },
    }),
    /non-empty string/,
  );
});

test("accepts declaredCapabilities with only optional fields set", () => {
  // All fields are optional — empty object is valid
  const chain: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: {} },
    ],
  };
  const normalized = normalizeGoalModelBinding(chain);
  assert.equal(normalized.candidates[0]?.declaredCapabilities.reasoning, undefined);
});

test("rejects normalizeGoalModelBinding with empty candidates array", () => {
  assert.throws(
    () => normalizeGoalModelBinding({
      candidates: [],
    }),
    /must not be empty/,
  );
});

test("rejects v2 catalog with candidates missing 'model' field", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        "valid-id": {
          candidates: [
            { declaredCapabilities: { reasoning: "high" } },
          ],
        },
      },
    }),
    /model/,
  );
});

test("rejects candidate with invalid retryPolicy (decimal)", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        impl: {
          candidates: [{ model: "placeholder/a", declaredCapabilities: { reasoning: "high" } }],
          retryPolicy: { attemptsPerCandidate: 1.5 },
        },
      },
    }),
    /positive integer/,
  );
});

test("rejects catalog with unknown binding-level keys", () => {
  assert.throws(
    () => parseGoalModelBindingCatalog({
      version: 2,
      harness: "pi",
      bindings: {
        impl: {
          model: "placeholder/a",
          declaredCapabilities: { reasoning: "high" },
          extraField: "bad",
        },
      },
    }),
    /extraField/,
  );
});

// ==========================================================================
// 4. Under-capable candidates — each capability dimension
// ==========================================================================

test("under-capable: missing reasoning", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/missing-reasoning",
    declaredCapabilities: { toolUse: "required" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES.strict, binding);
  assert.deepEqual(result.missingCapabilities, ["reasoning"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing contextWindowTokens", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/small-context",
    declaredCapabilities: { reasoning: "very_high", contextWindowTokens: 64000 },
  };
  const modelClass = parseGoalModelClassCatalog({
    version: 1,
    modelClasses: {
      big: {
        minimumRequirements: { reasoning: "very_high", contextWindowTokens: 128000 },
        fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
      },
    },
  }).modelClasses.big;
  const result = evaluateGoalModelBindingCompliance(modelClass, binding);
  assert.deepEqual(result.missingCapabilities, ["contextWindowTokens"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing toolUse", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/no-tools",
    declaredCapabilities: { reasoning: "very_high" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES.strict, binding);
  assert.deepEqual(result.missingCapabilities, ["toolUse"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing structuredOutput", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/no-struct",
    declaredCapabilities: { reasoning: "very_high", toolUse: "required", structuredOutput: "none" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        struct: {
          minimumRequirements: { structuredOutput: "strict" },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses.struct,
    binding,
  );
  assert.deepEqual(result.missingCapabilities, ["structuredOutput"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing formatFollowing", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/bad-format",
    declaredCapabilities: { reasoning: "very_high", formatFollowing: "low" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        fmt: {
          minimumRequirements: { formatFollowing: "medium" },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses.fmt,
    binding,
  );
  assert.deepEqual(result.missingCapabilities, ["formatFollowing"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing sourceCitation", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/no-cite",
    declaredCapabilities: { reasoning: "very_high", sourceCitation: "none" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        cite: {
          minimumRequirements: { sourceCitation: "preferred" },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses.cite,
    binding,
  );
  assert.deepEqual(result.missingCapabilities, ["sourceCitation"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: missing privacy", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/cloud",
    declaredCapabilities: { reasoning: "very_high", privacy: "cloud-ok" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        local: {
          minimumRequirements: { privacy: "local-only" },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses.local,
    binding,
  );
  assert.deepEqual(result.missingCapabilities, ["privacy"]);
  assert.equal(result.status, "blocked");
});

test("under-capable: multiple missing capabilities combined", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/very-weak",
    declaredCapabilities: { reasoning: "low", toolUse: "optional", structuredOutput: "none" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        demanding: {
          minimumRequirements: {
            reasoning: "high",
            toolUse: "required",
            structuredOutput: "strict",
            sourceCitation: "preferred",
          },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses.demanding,
    binding,
  );
  // Order: reasoning, toolUse, structuredOutput, sourceCitation
  assert.ok(result.missingCapabilities.length >= 3);
  assert.ok(result.missingCapabilities.includes("reasoning"));
  assert.ok(result.missingCapabilities.includes("toolUse"));
  assert.ok(result.missingCapabilities.includes("structuredOutput"));
  assert.ok(result.missingCapabilities.includes("sourceCitation"));
  assert.equal(result.status, "blocked");
});

test("under-capable with warn policy: status is warn, not blocked", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/weak",
    declaredCapabilities: { reasoning: "high" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES["warn-policy"], binding);
  assert.equal(result.status, "warn");
  assert.equal(result.satisfiesMinimum, false);
  assert.equal(result.downgraded, true);
});

test("under-capable with fallback-to-implementation: status is warn", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/weak",
    declaredCapabilities: { reasoning: "high" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES["fallback-impl"], binding);
  assert.equal(result.status, "warn");
  assert.equal(result.downgraded, true);
});

test("under-capable with block-downgrade policy: status is blocked", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/weak",
    declaredCapabilities: { reasoning: "high" },
  };
  const result = evaluateGoalModelBindingCompliance(CAPABLE_MODEL_CLASSES["block-downgrade"], binding);
  assert.equal(result.status, "blocked");
  assert.equal(result.downgraded, true);
});

// costSensitivity is advisory — never causes under-capable
test("costSensitivity mismatch does not mark as under-capable", () => {
  const binding: GoalModelSingleBinding = {
    model: "placeholder/costly",
    declaredCapabilities: { reasoning: "very_high", costSensitivity: "low" },
  };
  const result = evaluateGoalModelBindingCompliance(
    parseGoalModelClassCatalog({
      version: 1,
      modelClasses: {
        "cost-sensitive": {
          minimumRequirements: { reasoning: "very_high", costSensitivity: "high" },
          fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
        },
      },
    }).modelClasses["cost-sensitive"],
    binding,
  );
  // costSensitivity is advisory — does not make a binding under-capable
  assert.equal(result.status, "resolved");
  assert.equal(result.satisfiesMinimum, true);
  assert.deepEqual(result.missingCapabilities, []);
});

// ==========================================================================
// 5. Model fallback evidence serialization
// ==========================================================================

test("resolution evidence: full payload serializes and deserializes via JSON", () => {
  const evidence = {
    schemaVersion: "1.0" as const,
    harness: "pi",
    requested: {
      role: "implementer",
      modelScenario: "controller",
      modelClass: "controller",
      minimumRequirements: { reasoning: "high" },
    },
    resolved: {
      model: "placeholder/model-b",
      bindingSource: "catalogs/bindings/pi.json",
      candidateIndex: 1,
    },
    compliance: {
      satisfiesMinimum: false,
      downgraded: true,
      missingCapabilities: ["reasoning"],
    },
    attemptedCandidates: [
      {
        candidateIndex: 0,
        model: "placeholder/model-a",
        compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
        status: "failed" as const,
        reason: "missing capabilities: reasoning",
      },
      {
        candidateIndex: 1,
        model: "placeholder/model-b",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "succeeded" as const,
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
    exhaustedChain: false,
    status: "resolved" as const,
    reason: "fallback to model-b",
  };

  // Round-trip via JSON
  const json = JSON.stringify(evidence);
  const parsed = parseGoalModelResolutionJson(json);

  assert.equal(parsed.schemaVersion, "1.0");
  assert.equal(parsed.harness, "pi");
  assert.equal(parsed.requested.role, "implementer");
  assert.equal(parsed.requested.modelScenario, "controller");
  assert.equal(parsed.resolved?.model, "placeholder/model-b");
  assert.equal(parsed.resolved?.bindingSource, "catalogs/bindings/pi.json");
  assert.equal(parsed.resolved?.candidateIndex, 1);
  assert.equal(parsed.compliance.satisfiesMinimum, false);
  assert.equal(parsed.compliance.downgraded, true);
  assert.equal(parsed.compliance.missingCapabilities.length, 1);
  assert.equal(parsed.attemptedCandidates?.length, 2);
  assert.equal(parsed.attemptedCandidates?.[0]?.status, "failed");
  assert.equal(parsed.attemptedCandidates?.[0]?.reason, "missing capabilities: reasoning");
  assert.equal(parsed.attemptedCandidates?.[1]?.status, "succeeded");
  assert.equal(parsed.switchEvents?.length, 1);
  assert.equal(parsed.switchEvents?.[0]?.reason, "candidate_failed_compliance");
  assert.equal(parsed.exhaustedChain, false);
  assert.equal(parsed.status, "resolved");
  assert.equal(parsed.reason, "fallback to model-b");
});

test("resolution evidence: attempted candidate with 'skipped' status", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    attemptedCandidates: [
      {
        candidateIndex: 0,
        model: "placeholder/already-done",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "skipped",
        reason: "already resolved by previous attempt",
      },
    ],
    status: "resolved",
  });
  assert.equal(report.attemptedCandidates?.[0]?.status, "skipped");
  assert.equal(report.attemptedCandidates?.[0]?.reason, "already resolved by previous attempt");
});

test("resolution evidence: attempted candidate with 'error' status", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      modelClass: "implementation",
      minimumRequirements: { reasoning: "high" },
    },
    compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: [] },
    attemptedCandidates: [
      {
        candidateIndex: 0,
        model: "placeholder/gateway-timeout",
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "error",
        reason: "provider gateway timeout",
      },
    ],
    exhaustedChain: true,
    status: "blocked",
    reason: "all candidates errored",
  });
  assert.equal(report.attemptedCandidates?.[0]?.status, "error");
  assert.equal(report.attemptedCandidates?.[0]?.reason, "provider gateway timeout");
  assert.equal(report.exhaustedChain, true);
  assert.equal(report.reason, "all candidates errored");
});

test("resolution evidence: evaluateGoalModelResolutionCandidates with fallback-to-implementation policy", () => {
  const modelClass = CAPABLE_MODEL_CLASSES["fallback-impl"];
  const binding: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "very_high" } },
    ],
  };
  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  // First candidate is downgraded but fallback-to-implementation accepts it
  assert.equal(result.resolvedCandidateIndex, 0);
  assert.equal(result.exhaustedChain, false);
  assert.equal(result.attemptedCandidates.length, 1);
  assert.equal(result.attemptedCandidates[0]?.status, "succeeded");
  assert.equal(result.attemptedCandidates[0]?.compliance.downgraded, true);
  assert.equal(result.switchEvents.length, 0);
});

test("resolution evidence: evaluateGoalModelResolutionCandidates with warn policy", () => {
  const modelClass = CAPABLE_MODEL_CLASSES["warn-policy"];
  const binding: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "medium" } },
    ],
  };
  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, 0);
  assert.equal(result.attemptedCandidates[0]?.status, "succeeded");
  assert.equal(result.attemptedCandidates[0]?.compliance.downgraded, true);
});

test("resolution evidence: evaluateGoalModelResolutionCandidates with block policy exhausts chain", () => {
  const modelClass = CAPABLE_MODEL_CLASSES["block-downgrade"];
  const binding: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "high" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "medium" } },
    ],
  };
  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.resolvedCandidateIndex, undefined);
  assert.equal(result.exhaustedChain, true);
  assert.equal(result.attemptedCandidates.length, 2);
  assert.ok(result.attemptedCandidates.every((a) => a.status === "failed"));
  assert.equal(result.switchEvents.length, 1);
  assert.equal(result.switchEvents[0]?.reason, "candidate_failed_compliance");
});

test("resolution evidence: reason field on each failed attempt", () => {
  const modelClass = CAPABLE_MODEL_CLASSES["block-downgrade"];
  const binding: GoalModelBinding = {
    candidates: [
      { model: "placeholder/a", declaredCapabilities: { reasoning: "low" } },
      { model: "placeholder/b", declaredCapabilities: { reasoning: "high" } },
    ],
  };
  const result = evaluateGoalModelResolutionCandidates(modelClass, binding);
  assert.equal(result.attemptedCandidates[0]?.reason, "missing capabilities: reasoning");
  assert.equal(result.attemptedCandidates[1]?.reason, "missing capabilities: reasoning");
});

test("resolution evidence: schemaVersion must be 1.0", () => {
  assert.throws(
    () => parseGoalModelResolution({
      schemaVersion: "2.0",
      harness: "pi",
      requested: { modelClass: "x", minimumRequirements: {} },
      compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
      status: "resolved",
    }),
    /schemaVersion/,
  );
});

test("resolution evidence: top-level reason is optional", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: { modelClass: "x", minimumRequirements: {} },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  assert.equal(report.reason, undefined);
});

test("resolution evidence: requested with role but no modelScenario", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: {
      role: "implementer",
      modelClass: "implementation",
      minimumRequirements: { reasoning: "medium" },
    },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  assert.equal(report.requested.role, "implementer");
  assert.equal(report.requested.modelScenario, undefined);
});

test("resolution evidence: resolved without bindingSource", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: { modelClass: "x", minimumRequirements: {} },
    resolved: { model: "placeholder/a" },
    compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
    status: "resolved",
  });
  assert.equal(report.resolved?.bindingSource, undefined);
  assert.equal(report.resolved?.candidateIndex, undefined);
});

test("resolution evidence: status 'blocked' without resolved block", () => {
  const report = parseGoalModelResolution({
    schemaVersion: "1.0",
    harness: "pi",
    requested: { modelClass: "x", minimumRequirements: {} },
    compliance: { satisfiesMinimum: false, downgraded: true, missingCapabilities: ["reasoning"] },
    status: "blocked",
    reason: "no capable model available",
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.resolved, undefined);
  assert.equal(report.reason, "no capable model available");
});
