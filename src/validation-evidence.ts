/**
 * Shared supported required-evidence token registry.
 *
 * This module is the single pipeline-wide source of truth for
 * controller-enforced `validation.requiredEvidence` tokens.  Every
 * consumer — goal-spec producer, goal-dag builder, and goal-runner
 * parser / validator — must reference this registry instead of
 * maintaining its own copy.
 */

export const SUPPORTED_REQUIRED_EVIDENCE = [
  "validators-ran",
  "locked-artifacts-unchanged",
  "implementation-diff-present",
  "non-test-diff-present",
  "post-merge-validation-ran",
  "audit-report-present",
] as const;

/** Closed union derived from the canonical token list. */
export type GoalValidationEvidenceRequirement =
  (typeof SUPPORTED_REQUIRED_EVIDENCE)[number];

/** O(1) lookup set built from the canonical token list. */
export const SUPPORTED_REQUIRED_EVIDENCE_SET: ReadonlySet<string> =
  new Set(SUPPORTED_REQUIRED_EVIDENCE);

/**
 * Type guard / runtime check to determine whether a string value is a
 * supported controller-enforced evidence token.
 */
export function isSupportedRequiredEvidence(
  value: string,
): value is GoalValidationEvidenceRequirement {
  return SUPPORTED_REQUIRED_EVIDENCE_SET.has(value);
}

/**
 * Validate that an input value is a supported required-evidence token.
 * Throws with a clear supported-values message on failure.
 */
export function requireSupportedRequiredEvidence(
  value: unknown,
  path: string,
): GoalValidationEvidenceRequirement {
  if (typeof value !== "string" || !isSupportedRequiredEvidence(value)) {
    throw new Error(
      `Invalid requiredEvidence token at ${path}: ${JSON.stringify(value)}. ` +
        `Supported values are: ${SUPPORTED_REQUIRED_EVIDENCE.join(", ")}`,
    );
  }
  return value;
}
