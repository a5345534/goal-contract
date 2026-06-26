/**
 * Goal DAG on-disk file contract.
 *
 * These types represent the canonical shape of a Goal DAG JSON file as
 * consumed by goal-runner via `/goal --dag <path>`.  They are the
 * pipeline-wide contract; goal-dag produces them and goal-runner consumes
 * them.
 *
 * Runtime-only state (GoalDagNode, GoalSubagentRecord, etc.) that carries
 * controller-managed fields beyond the on-disk contract is **not** included
 * here and remains in goal-runner.
 */
import type { GoalModelRoutingConfig, GoalDagRisk } from "./model-routing.js";
import type { GoalValidationEvidenceRequirement } from "./validation-evidence.js";
/**
 * Closed vocabulary of quality profiles that control how downstream runtimes
 * prompt, validate, and complete DAG nodes.
 *
 * New profiles require a subsequent governed contract change.
 */
export declare const ALL_GOAL_QUALITY_PROFILES: readonly ["incremental-implementation", "test-driven-change", "code-review-required", "independent-audit", "security-sensitive-review", "api-contract-change", "database-migration", "docs-required", "observability-required", "ship-preflight"];
/** Compatibility alias for producer/runtime code that imports the shorter name. */
export declare const GOAL_QUALITY_PROFILES: readonly ["incremental-implementation", "test-driven-change", "code-review-required", "independent-audit", "security-sensitive-review", "api-contract-change", "database-migration", "docs-required", "observability-required", "ship-preflight"];
export type GoalQualityProfile = (typeof ALL_GOAL_QUALITY_PROFILES)[number];
export declare const ALL_GOAL_QUALITY_PROFILES_SET: ReadonlySet<string>;
/** Compatibility alias for producer/runtime code that imports the shorter name. */
export declare const GOAL_QUALITY_PROFILE_SET: ReadonlySet<string>;
export declare function isGoalQualityProfile(value: string): value is GoalQualityProfile;
export declare function requireGoalQualityProfile(value: unknown, path: string): GoalQualityProfile;
type QualityProfileSource = readonly GoalQualityProfile[] | {
    qualityProfiles?: readonly GoalQualityProfile[];
} | undefined;
/** Resolve defaults + node quality profiles with stable first-seen de-duplication. */
export declare function resolveGoalQualityProfiles(defaults: QualityProfileSource, node: QualityProfileSource): GoalQualityProfile[];
export interface GoalDagConflictHints {
    files?: string[];
    modules?: string[];
    capabilities?: string[];
}
export type GoalDagNodeKind = "test-spec" | "test-review" | "implementation" | "audit" | "review" | "validation" | string;
export interface GoalValidationArtifactLock {
    path: string;
    sha256: string;
    sourceNodeId?: string;
    approvedByNodeId?: string;
    approvedAt?: string;
}
export interface GoalDagValidationContract {
    profile?: string;
    testSpecNodeId?: string;
    approvedByNodeId?: string;
    artifactLocks?: GoalValidationArtifactLock[];
    requiredEvidence?: GoalValidationEvidenceRequirement[];
    onAuditTestGap?: string;
    diffBaseRef?: string;
    auditReportPaths?: string[];
    allowedPaths?: string[];
    forbiddenPaths?: string[];
}
export interface GoalDagNodeWorkspaceBinding {
    worktreeSlug?: string;
    branch?: string;
    baseRef?: string;
}
export interface GoalDagFileDocument {
    version: 1;
    objective: string;
    defaults?: GoalDagFileDefaults;
    modelRouting?: GoalModelRoutingConfig;
    nodes: GoalDagFileNode[];
}
export interface GoalDagFileDefaults {
    outputs?: string[];
    validators?: string[];
    workspaceStrategy?: string;
    completionGates?: string[];
    conflicts?: GoalDagConflictHints;
    modelScenario?: string;
    thinkingLevel?: string;
    qualityProfiles?: GoalQualityProfile[];
}
export interface GoalDagFileNode {
    id: string;
    objective: string;
    after?: string[];
    outputs?: string[];
    validators?: string[];
    conflicts?: GoalDagConflictHints;
    scope?: string;
    kind?: GoalDagNodeKind;
    validation?: GoalDagValidationContract;
    workspaceStrategy?: string;
    workspace?: GoalDagNodeWorkspaceBinding;
    risk?: GoalDagRisk;
    completionGates?: string[];
    modelScenario?: string;
    thinkingLevel?: string;
    qualityProfiles?: GoalQualityProfile[];
}
export {};
