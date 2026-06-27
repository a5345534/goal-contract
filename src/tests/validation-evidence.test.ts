import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_REQUIRED_EVIDENCE,
  SUPPORTED_REQUIRED_EVIDENCE_SET,
  isSupportedRequiredEvidence,
  requireSupportedRequiredEvidence,
  type GoalValidationEvidenceRequirement,
} from "../validation-evidence.js";

test("all 6 supported tokens are accepted", () => {
  for (const token of SUPPORTED_REQUIRED_EVIDENCE) {
    assert.ok(isSupportedRequiredEvidence(token), `token '${token}' should be supported`);
    assert.ok(SUPPORTED_REQUIRED_EVIDENCE_SET.has(token));
  }
});

test("arbitrary prose string is rejected", () => {
  assert.equal(isSupportedRequiredEvidence("pnpm test passes"), false);
  assert.equal(SUPPORTED_REQUIRED_EVIDENCE_SET.has("manual review"), false);
});

test("empty string is rejected", () => {
  assert.equal(isSupportedRequiredEvidence(""), false);
  assert.equal(isSupportedRequiredEvidence("  "), false);
});

test("requireSupportedRequiredEvidence throws for unsupported token", () => {
  assert.throws(
    () => requireSupportedRequiredEvidence("pnpm test passes", "test.path"),
    /requiredEvidence/,
  );
});

test("requireSupportedRequiredEvidence throws for non-string", () => {
  assert.throws(() => requireSupportedRequiredEvidence(42, "test.path"), /requiredEvidence/);
  assert.throws(() => requireSupportedRequiredEvidence(null, "test.path"), /requiredEvidence/);
});

test("requireSupportedRequiredEvidence returns typed token for valid input", () => {
  const token: GoalValidationEvidenceRequirement = requireSupportedRequiredEvidence("validators-ran", "t");
  assert.equal(token, "validators-ran");
});

test("SUPPORTED_REQUIRED_EVIDENCE length is 9", () => {
  assert.equal(SUPPORTED_REQUIRED_EVIDENCE.length, 9);
});

test("new resolution evidence tokens are accepted", () => {
  assert.ok(isSupportedRequiredEvidence("candidate-fallback-chain-used"));
  assert.ok(isSupportedRequiredEvidence("exhausted-all-candidates"));
  assert.ok(isSupportedRequiredEvidence("candidate-switch-recorded"));
});

test("all tokens are included", () => {
  const expected = [
    "validators-ran",
    "locked-artifacts-unchanged",
    "implementation-diff-present",
    "non-test-diff-present",
    "post-merge-validation-ran",
    "audit-report-present",
    "candidate-fallback-chain-used",
    "exhausted-all-candidates",
    "candidate-switch-recorded",
  ];
  assert.deepEqual([...SUPPORTED_REQUIRED_EVIDENCE].sort(), expected.sort());
});
