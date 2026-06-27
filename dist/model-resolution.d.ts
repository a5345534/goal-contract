import { type GoalModelClass, type GoalModelMinimumRequirements } from "./model-class.js";
import { type GoalModelBinding, type GoalModelBindingRetryPolicy } from "./model-binding.js";
/**
 * Per-candidate attempt record written by the resolver as it walks the
 * fallback chain.  The resolver appends a record for each candidate it
 * selects, whether or not the attempt succeeded.
 */
export interface GoalModelResolutionAttemptedCandidate {
    /** 0-based index into the source binding's candidate array. */
    candidateIndex: number;
    /** The concrete model id for this candidate. */
    model: string;
    /** Compliance evaluation outcome for this candidate. */
    compliance: {
        satisfiesMinimum: boolean;
        downgraded: boolean;
        missingCapabilities: string[];
    };
    /**
     * Resolution outcome for this candidate:
     *  - "succeeded" — the candidate resolved and was used.
     *  - "failed" — the candidate was attempted but did not resolve (error,
     *    timeout, unavailable).
     *  - "skipped" — the candidate was bypassed without an attempt
     *    (prerequisite failure, policy skip).
     *  - "error" — the attempt produced a non-recoverable error.
     */
    status: "succeeded" | "failed" | "skipped" | "error";
    /** Optional human-readable reason for the attempt outcome. */
    reason?: string;
}
/**
 * A chronological record of a candidate switch (fallback step) within a
 * resolution session.
 */
export interface GoalModelResolutionSwitchEvent {
    /** 0-based index of the source candidate in the fallback chain. */
    fromCandidateIndex: number;
    /** Concrete model id of the source candidate. */
    fromModel: string;
    /** 0-based index of the target candidate in the fallback chain. */
    toCandidateIndex: number;
    /** Concrete model id of the target candidate. */
    toModel: string;
    /** Machine-readable reason category for the switch. */
    reason: string;
}
/**
 * Full operator-ordered candidate plan produced from a binding catalog. Unlike
 * attemptedCandidates, this preserves candidates that were not selected during
 * initial resolution so the runner can switch to them later after runtime
 * model-switchable failures.
 */
export interface GoalModelResolutionCandidatePlanEntry {
    /** 0-based index into the source binding's candidate array. */
    candidateIndex: number;
    /** Concrete model id for this candidate. */
    model: string;
    /** Capability compliance evaluation for this candidate. */
    compliance: {
        satisfiesMinimum: boolean;
        downgraded: boolean;
        missingCapabilities: string[];
    };
    /** True when this candidate is eligible for runtime selection/fallback. */
    eligible: boolean;
    /** Optional human-readable reason when the candidate is ineligible. */
    reason?: string;
}
export interface GoalModelResolution {
    schemaVersion: "1.0";
    harness: string;
    requested: {
        role?: string;
        modelScenario?: string;
        modelClass: string;
        minimumRequirements: GoalModelMinimumRequirements;
    };
    resolved?: {
        model: string;
        /** Which harness binding (catalog binding id) was used. */
        bindingSource?: string;
        /**
         * 0-based index into the source binding's candidate chain that was
         * ultimately selected.  Absent when status is "blocked" or no
         * candidate chain exists.
         */
        candidateIndex?: number;
    };
    compliance: {
        satisfiesMinimum: boolean;
        downgraded: boolean;
        missingCapabilities: string[];
    };
    /**
     * Ordered list of per-candidate attempt records capturing which
     * candidates were tried, in what order, and their resolution outcome.
     * Present when the binding uses a candidate chain (v2 catalog) or
     * fallback logic is exercised.
     */
    attemptedCandidates?: GoalModelResolutionAttemptedCandidate[];
    /**
     * Chronological list of switch (fallback) events recorded during
     * resolution.  Each entry records a move from one candidate to the
     * next in the chain.
     */
    switchEvents?: GoalModelResolutionSwitchEvent[];
    /** Full ordered candidate plan used for runtime fallback switching. */
    candidatePlan?: GoalModelResolutionCandidatePlanEntry[];
    /** Retry policy copied from the source binding catalog, when configured. */
    retryPolicy?: GoalModelBindingRetryPolicy;
    /**
     * True when every candidate in the chain has been exhausted without
     * a successful resolution.
     */
    exhaustedChain?: boolean;
    status: "resolved" | "blocked" | "warn";
    reason?: string;
}
export declare function parseGoalModelResolutionJson(json: string, path?: string): GoalModelResolution;
export declare function parseGoalModelResolution(input: unknown, path?: string): GoalModelResolution;
/**
 * Evaluate a candidate chain binding against a model class and produce
 * resolution evidence plus the full runtime candidate plan.
 *
 * `attemptedCandidates` records the candidates actually walked during initial
 * resolution and stops at the first eligible candidate. `candidatePlan` keeps
 * every operator-ordered candidate with capability eligibility so the runner can
 * later switch to unattempted eligible candidates after runtime model-switchable
 * failures.
 */
export declare function evaluateGoalModelResolutionCandidates(modelClass: GoalModelClass, binding: GoalModelBinding): {
    attemptedCandidates: GoalModelResolutionAttemptedCandidate[];
    switchEvents: GoalModelResolutionSwitchEvent[];
    candidatePlan: GoalModelResolutionCandidatePlanEntry[];
    retryPolicy?: GoalModelBindingRetryPolicy;
    exhaustedChain: boolean;
    resolvedCandidateIndex?: number;
};
