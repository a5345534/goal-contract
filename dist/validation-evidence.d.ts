/**
 * Shared supported required-evidence token registry.
 *
 * This module is the single pipeline-wide source of truth for
 * controller-enforced `validation.requiredEvidence` tokens.  Every
 * consumer — goal-spec producer, goal-dag builder, and goal-runner
 * parser / validator — must reference this registry instead of
 * maintaining its own copy.
 */
export declare const SUPPORTED_REQUIRED_EVIDENCE: readonly ["validators-ran", "locked-artifacts-unchanged", "implementation-diff-present", "non-test-diff-present", "post-merge-validation-ran", "audit-report-present", "candidate-fallback-chain-used", "exhausted-all-candidates", "candidate-switch-recorded"];
/** Closed union derived from the canonical token list. */
export type GoalValidationEvidenceRequirement = (typeof SUPPORTED_REQUIRED_EVIDENCE)[number];
/** O(1) lookup set built from the canonical token list. */
export declare const SUPPORTED_REQUIRED_EVIDENCE_SET: ReadonlySet<string>;
/**
 * Type guard / runtime check to determine whether a string value is a
 * supported controller-enforced evidence token.
 */
export declare function isSupportedRequiredEvidence(value: string): value is GoalValidationEvidenceRequirement;
/**
 * Validate that an input value is a supported required-evidence token.
 * Throws with a clear supported-values message on failure.
 */
export declare function requireSupportedRequiredEvidence(value: unknown, path: string): GoalValidationEvidenceRequirement;
