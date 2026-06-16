/**
 * Pure Goal DAG file parser.
 *
 * This module validates the on-disk shape of a Goal DAG JSON file:
 * structural constraints, id patterns, dependency existence, acyclicity,
 * model-scenario referential integrity, required-evidence token support,
 * workspace binding shape, and artifact-lock sha256 format.
 *
 * It does **not** materialise runtime scheduler nodes or plan execution
 * slots.  Those operations (`planGoalDagFromFileDocument`,
 * `createGoalDagNodes`, etc.) belong in goal-runner.
 */

import {
  parseGoalModelRoutingConfig,
  type GoalModelRoutingConfig,
} from "./model-routing.js";
import {
  SUPPORTED_REQUIRED_EVIDENCE_SET,
  requireSupportedRequiredEvidence,
  type GoalValidationEvidenceRequirement,
} from "./validation-evidence.js";
import type {
  GoalDagConflictHints,
  GoalDagFileDefaults,
  GoalDagFileDocument,
  GoalDagFileNode,
  GoalDagValidationContract,
  GoalValidationArtifactLock,
} from "./goal-dag-types.js";

export type {
  GoalDagConflictHints,
  GoalDagFileDefaults,
  GoalDagFileDocument,
  GoalDagFileNode,
  GoalDagValidationContract,
  GoalValidationArtifactLock,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAG_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export function parseGoalDagFileContent(content: string): GoalDagFileDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid goal DAG file JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseGoalDagFileDocument(parsed);
}

export function parseGoalDagFileDocument(input: unknown): GoalDagFileDocument {
  if (!isRecord(input)) throw new Error("Invalid goal DAG file: root must be an object");
  assertKnownKeys(input, ["version", "objective", "defaults", "modelRouting", "nodes"], "root");

  const version = input.version;
  if (version !== 1) throw new Error("Invalid goal DAG file: version must be 1");

  const objective = requireNonEmptyString(input.objective, "objective");

  const defaults =
    input.defaults === undefined
      ? undefined
      : parseDefaults(input.defaults, "defaults");

  const modelRouting =
    input.modelRouting === undefined
      ? undefined
      : parseGoalModelRoutingConfig(input.modelRouting, "modelRouting");

  if (!Array.isArray(input.nodes)) throw new Error("Invalid goal DAG file: nodes must be an array");
  if (input.nodes.length === 0) throw new Error("Invalid goal DAG file: nodes must not be empty");

  const nodes = input.nodes.map((node, index) => parseNode(node, `nodes[${index}]`));

  validateFileNodeGraph(nodes);
  validateFileModelScenarios(defaults, nodes, modelRouting);

  return {
    version,
    objective,
    ...(defaults ? { defaults } : {}),
    ...(modelRouting ? { modelRouting } : {}),
    nodes,
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function parseDefaults(input: unknown, path: string): GoalDagFileDefaults {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(
    input,
    [
      "outputs", "validators", "workspaceStrategy", "completionGates",
      "conflicts", "modelScenario", "thinkingLevel",
    ],
    path,
  );

  const defaults: GoalDagFileDefaults = {};
  if (input.outputs !== undefined) defaults.outputs = parseStringArray(input.outputs, `${path}.outputs`);
  if (input.validators !== undefined) defaults.validators = parseStringArray(input.validators, `${path}.validators`);
  if (input.workspaceStrategy !== undefined) defaults.workspaceStrategy = requireNonEmptyString(input.workspaceStrategy, `${path}.workspaceStrategy`);
  if (input.completionGates !== undefined) defaults.completionGates = parseStringArray(input.completionGates, `${path}.completionGates`);
  if (input.conflicts !== undefined) defaults.conflicts = parseConflicts(input.conflicts, `${path}.conflicts`);
  if (input.modelScenario !== undefined) defaults.modelScenario = requireNonEmptyString(input.modelScenario, `${path}.modelScenario`);
  if (input.thinkingLevel !== undefined) defaults.thinkingLevel = requireNonEmptyString(input.thinkingLevel, `${path}.thinkingLevel`);
  return defaults;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

function parseNode(input: unknown, path: string): GoalDagFileNode {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(
    input,
    [
      "id", "objective", "after", "outputs", "validators", "conflicts",
      "scope", "kind", "validation", "workspaceStrategy", "workspace",
      "risk", "completionGates", "modelScenario", "thinkingLevel",
    ],
    path,
  );

  const id = requireKebabId(input.id, `${path}.id`);
  const objective = requireNonEmptyString(input.objective, `${path}.objective`);
  const node: GoalDagFileNode = { id, objective };

  if (input.after !== undefined) node.after = parseIdArray(input.after, `${path}.after`);
  if (input.outputs !== undefined) node.outputs = parseStringArray(input.outputs, `${path}.outputs`);
  if (input.validators !== undefined) node.validators = parseStringArray(input.validators, `${path}.validators`);
  if (input.conflicts !== undefined) node.conflicts = parseConflicts(input.conflicts, `${path}.conflicts`);
  if (input.scope !== undefined) node.scope = requireNonEmptyString(input.scope, `${path}.scope`);
  if (input.kind !== undefined) node.kind = requireNonEmptyString(input.kind, `${path}.kind`);
  if (input.validation !== undefined) node.validation = parseValidationContract(input.validation, `${path}.validation`);
  if (input.workspaceStrategy !== undefined) node.workspaceStrategy = requireNonEmptyString(input.workspaceStrategy, `${path}.workspaceStrategy`);
  if (input.workspace !== undefined) node.workspace = parseWorkspaceBinding(input.workspace, `${path}.workspace`);
  if (input.risk !== undefined) node.risk = parseRisk(input.risk, `${path}.risk`);
  if (input.completionGates !== undefined) node.completionGates = parseStringArray(input.completionGates, `${path}.completionGates`);
  if (input.modelScenario !== undefined) node.modelScenario = requireNonEmptyString(input.modelScenario, `${path}.modelScenario`);
  if (input.thinkingLevel !== undefined) node.thinkingLevel = requireNonEmptyString(input.thinkingLevel, `${path}.thinkingLevel`);

  return node;
}

// ---------------------------------------------------------------------------
// Workspace binding
// ---------------------------------------------------------------------------

function parseWorkspaceBinding(input: unknown, path: string): GoalDagFileNode["workspace"] {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(input, ["worktreeSlug", "branch", "baseRef"], path);
  const binding: NonNullable<GoalDagFileNode["workspace"]> = {};
  if (input.worktreeSlug !== undefined) binding.worktreeSlug = requireNonEmptyString(input.worktreeSlug, `${path}.worktreeSlug`);
  if (input.branch !== undefined) binding.branch = requireNonEmptyString(input.branch, `${path}.branch`);
  if (input.baseRef !== undefined) binding.baseRef = requireNonEmptyString(input.baseRef, `${path}.baseRef`);
  if (!binding.worktreeSlug && !binding.branch && !binding.baseRef) {
    throw new Error(`Invalid goal DAG file: ${path} must set worktreeSlug, branch, or baseRef`);
  }
  return binding;
}

// ---------------------------------------------------------------------------
// Validation contract
// ---------------------------------------------------------------------------

function parseValidationContract(
  input: unknown,
  path: string,
): GoalDagValidationContract {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(
    input,
    [
      "profile", "testSpecNodeId", "approvedByNodeId", "artifactLocks",
      "requiredEvidence", "onAuditTestGap", "diffBaseRef",
      "auditReportPaths", "allowedPaths", "forbiddenPaths",
    ],
    path,
  );

  const contract: GoalDagValidationContract = {};
  if (input.profile !== undefined) contract.profile = requireNonEmptyString(input.profile, `${path}.profile`);
  if (input.testSpecNodeId !== undefined) contract.testSpecNodeId = requireKebabId(input.testSpecNodeId, `${path}.testSpecNodeId`);
  if (input.approvedByNodeId !== undefined) contract.approvedByNodeId = requireKebabId(input.approvedByNodeId, `${path}.approvedByNodeId`);
  if (input.artifactLocks !== undefined) contract.artifactLocks = parseArtifactLocks(input.artifactLocks, `${path}.artifactLocks`);
  if (input.requiredEvidence !== undefined) contract.requiredEvidence = parseRequiredEvidence(input.requiredEvidence, `${path}.requiredEvidence`);
  if (input.onAuditTestGap !== undefined) contract.onAuditTestGap = requireNonEmptyString(input.onAuditTestGap, `${path}.onAuditTestGap`);
  if (input.diffBaseRef !== undefined) contract.diffBaseRef = requireNonEmptyString(input.diffBaseRef, `${path}.diffBaseRef`);
  if (input.auditReportPaths !== undefined) contract.auditReportPaths = parseStringArray(input.auditReportPaths, `${path}.auditReportPaths`);
  if (input.allowedPaths !== undefined) contract.allowedPaths = parseStringArray(input.allowedPaths, `${path}.allowedPaths`);
  if (input.forbiddenPaths !== undefined) contract.forbiddenPaths = parseStringArray(input.forbiddenPaths, `${path}.forbiddenPaths`);
  return contract;
}

// ---------------------------------------------------------------------------
// Artifact locks
// ---------------------------------------------------------------------------

function parseArtifactLocks(input: unknown, path: string): GoalValidationArtifactLock[] {
  if (!Array.isArray(input)) throw new Error(`Invalid goal DAG file: ${path} must be an array`);
  return input.map((item, index) => parseArtifactLock(item, `${path}[${index}]`));
}

function parseArtifactLock(input: unknown, path: string): GoalValidationArtifactLock {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(input, ["path", "sha256", "sourceNodeId", "approvedByNodeId", "approvedAt"], path);
  const lock: GoalValidationArtifactLock = {
    path: requireNonEmptyString(input.path, `${path}.path`),
    sha256: requireSha256(input.sha256, `${path}.sha256`),
  };
  if (input.sourceNodeId !== undefined) lock.sourceNodeId = requireKebabId(input.sourceNodeId, `${path}.sourceNodeId`);
  if (input.approvedByNodeId !== undefined) lock.approvedByNodeId = requireKebabId(input.approvedByNodeId, `${path}.approvedByNodeId`);
  if (input.approvedAt !== undefined) lock.approvedAt = requireNonEmptyString(input.approvedAt, `${path}.approvedAt`);
  return lock;
}

// ---------------------------------------------------------------------------
// Required evidence
// ---------------------------------------------------------------------------

function parseRequiredEvidence(
  input: unknown,
  path: string,
): GoalValidationEvidenceRequirement[] {
  if (!Array.isArray(input)) throw new Error(`Invalid goal DAG file: ${path} must be an array`);

  const seen = new Set<string>();
  const result: GoalValidationEvidenceRequirement[] = [];

  for (let i = 0; i < input.length; i++) {
    const token = requireSupportedRequiredEvidence(input[i], `${path}[${i}]`);
    if (seen.has(token)) {
      throw new Error(
        `Invalid goal DAG file: ${path} contains duplicate required evidence: ${JSON.stringify(token)}`,
      );
    }
    seen.add(token);
    result.push(token);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

function parseConflicts(input: unknown, path: string): GoalDagConflictHints {
  if (!isRecord(input)) throw new Error(`Invalid goal DAG file: ${path} must be an object`);
  assertKnownKeys(input, ["files", "modules", "capabilities"], path);
  const conflicts: GoalDagConflictHints = {};
  if (input.files !== undefined) conflicts.files = parseStringArray(input.files, `${path}.files`);
  if (input.modules !== undefined) conflicts.modules = parseStringArray(input.modules, `${path}.modules`);
  if (input.capabilities !== undefined) conflicts.capabilities = parseStringArray(input.capabilities, `${path}.capabilities`);
  return conflicts;
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

function parseRisk(input: unknown, path: string): GoalDagFileNode["risk"] {
  if (input === "low" || input === "medium" || input === "high") return input;
  throw new Error(`Invalid goal DAG file: ${path} must be one of low, medium, high`);
}

// ---------------------------------------------------------------------------
// Graph validation
// ---------------------------------------------------------------------------

function validateFileNodeGraph(nodes: GoalDagFileNode[]): void {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Invalid goal DAG file: duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  for (const node of nodes) {
    for (const dependency of node.after ?? []) {
      if (!ids.has(dependency)) {
        throw new Error(`Invalid goal DAG file: node ${node.id} depends on missing node ${dependency}`);
      }
      if (dependency === node.id) {
        throw new Error(`Invalid goal DAG file: node ${node.id} depends on itself`);
      }
    }
  }
  validateFileNodeAcyclicity(nodes);
}

function validateFileNodeAcyclicity(nodes: GoalDagFileNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (node: GoalDagFileNode): string[] | undefined => {
    if (visiting.has(node.id)) {
      const start = stack.indexOf(node.id);
      return [...stack.slice(start), node.id];
    }
    if (visited.has(node.id)) return undefined;
    visiting.add(node.id);
    stack.push(node.id);
    for (const dependencyId of node.after ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node.id);
    visited.add(node.id);
    return undefined;
  };

  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle && cycle.length > 0) {
      throw new Error(`Invalid goal DAG file: cycle detected: ${cycle.join(" -> ")}`);
    }
  }
}

function validateFileModelScenarios(
  defaults: GoalDagFileDefaults | undefined,
  nodes: GoalDagFileNode[],
  modelRouting: GoalModelRoutingConfig | undefined,
): void {
  const assertScenario = (scenario: string, path: string): void => {
    if (!modelRouting || !(scenario in (modelRouting.scenarios ?? {}))) {
      throw new Error(
        `Invalid goal DAG file: ${path} references unknown model scenario ${JSON.stringify(scenario)}`,
      );
    }
  };
  if (defaults?.modelScenario) assertScenario(defaults.modelScenario, "defaults.modelScenario");
  nodes.forEach((node, index) => {
    if (node.modelScenario) assertScenario(node.modelScenario, `nodes[${index}].modelScenario`);
  });
}

// ---------------------------------------------------------------------------
// Low-level parsers
// ---------------------------------------------------------------------------

function parseIdArray(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) throw new Error(`Invalid goal DAG file: ${path} must be an array`);
  return input.map((item, index) => requireKebabId(item, `${path}[${index}]`));
}

function parseStringArray(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) throw new Error(`Invalid goal DAG file: ${path} must be an array`);
  return input.map((item, index) => requireNonEmptyString(item, `${path}[${index}]`));
}

function requireKebabId(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!DAG_ID_PATTERN.test(value)) {
    throw new Error(`Invalid goal DAG file: ${path} must be kebab-case (${DAG_ID_PATTERN.source})`);
  }
  return value;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`Invalid goal DAG file: ${path} must be a non-empty string`);
  }
  return input.trim();
}

function requireSha256(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`Invalid goal DAG file: ${path} must be a sha256 hex digest`);
  }
  return value.toLowerCase();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function assertKnownKeys(
  input: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) {
      throw new Error(`Invalid goal DAG file: ${path} has unsupported field ${key}`);
    }
  }
}
