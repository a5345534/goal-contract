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

// ---------------------------------------------------------------------------
// Quality profiles
// ---------------------------------------------------------------------------

/**
 * Closed vocabulary of quality profiles that control how downstream runtimes
 * prompt, validate, and complete DAG nodes.
 *
 * New profiles require a subsequent governed contract change.
 */
export const ALL_GOAL_QUALITY_PROFILES = [
  "incremental-implementation",
  "test-driven-change",
  "code-review-required",
  "independent-audit",
  "security-sensitive-review",
  "api-contract-change",
  "database-migration",
  "docs-required",
  "observability-required",
  "ship-preflight",
] as const;

/** Compatibility alias for producer/runtime code that imports the shorter name. */
export const GOAL_QUALITY_PROFILES = ALL_GOAL_QUALITY_PROFILES;

export type GoalQualityProfile = (typeof ALL_GOAL_QUALITY_PROFILES)[number];

export const ALL_GOAL_QUALITY_PROFILES_SET: ReadonlySet<string> =
  new Set(ALL_GOAL_QUALITY_PROFILES);

/** Compatibility alias for producer/runtime code that imports the shorter name. */
export const GOAL_QUALITY_PROFILE_SET = ALL_GOAL_QUALITY_PROFILES_SET;

export function isGoalQualityProfile(value: string): value is GoalQualityProfile {
  return ALL_GOAL_QUALITY_PROFILES_SET.has(value);
}

export function requireGoalQualityProfile(value: unknown, path: string): GoalQualityProfile {
  if (typeof value !== "string" || !isGoalQualityProfile(value)) {
    throw new Error(
      `Invalid quality profile at ${path}: ${JSON.stringify(value)}. ` +
        `Supported values are: ${ALL_GOAL_QUALITY_PROFILES.join(", ")}`,
    );
  }
  return value;
}

type QualityProfileSource =
  | readonly GoalQualityProfile[]
  | { qualityProfiles?: readonly GoalQualityProfile[] }
  | undefined;

/** Resolve defaults + node quality profiles with stable first-seen de-duplication. */
export function resolveGoalQualityProfiles(
  defaults: QualityProfileSource,
  node: QualityProfileSource,
): GoalQualityProfile[] {
  const seen = new Set<GoalQualityProfile>();
  const resolved: GoalQualityProfile[] = [];
  for (const profile of [...qualityProfileList(defaults), ...qualityProfileList(node)]) {
    if (seen.has(profile)) continue;
    seen.add(profile);
    resolved.push(profile);
  }
  return resolved;
}

function qualityProfileList(source: QualityProfileSource): readonly GoalQualityProfile[] {
  if (!source) return [];
  if (Array.isArray(source)) return source as readonly GoalQualityProfile[];
  return (source as { qualityProfiles?: readonly GoalQualityProfile[] }).qualityProfiles ?? [];
}

// ---------------------------------------------------------------------------
// Conflict hints
// ---------------------------------------------------------------------------

export interface GoalDagConflictHints {
  files?: string[];
  modules?: string[];
  capabilities?: string[];
}

// ---------------------------------------------------------------------------
// Validation contract
// ---------------------------------------------------------------------------

export type GoalDagNodeKind =
  | "test-spec"
  | "test-review"
  | "implementation"
  | "audit"
  | "review"
  | "validation"
  | string;

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

// ---------------------------------------------------------------------------
// Workspace binding
// ---------------------------------------------------------------------------

export interface GoalDagNodeWorkspaceBinding {
  worktreeSlug?: string;
  branch?: string;
  baseRef?: string;
}

// ---------------------------------------------------------------------------
// DAG file document
// ---------------------------------------------------------------------------

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
