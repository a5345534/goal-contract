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
}
