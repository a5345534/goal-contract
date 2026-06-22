import {
  parseGoalModelMinimumRequirements,
  type GoalModelMinimumRequirements,
} from "./model-class.js";

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
    bindingSource?: string;
  };
  compliance: {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
  };
  status: "resolved" | "blocked" | "warn";
  reason?: string;
}

export function parseGoalModelResolutionJson(json: string, path = "modelResolution"): GoalModelResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid goal model resolution JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseGoalModelResolution(parsed, path);
}

export function parseGoalModelResolution(input: unknown, path = "modelResolution"): GoalModelResolution {
  if (!isRecord(input)) throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["schemaVersion", "harness", "requested", "resolved", "compliance", "status", "reason"], path);
  if (input.schemaVersion !== "1.0") throw new Error(`Invalid goal model resolution: ${path}.schemaVersion must be "1.0"`);
  const harness = requireNonEmptyString(input.harness, `${path}.harness`);
  const requested = parseRequested(input.requested, `${path}.requested`);
  const resolved = input.resolved === undefined ? undefined : parseResolved(input.resolved, `${path}.resolved`);
  const compliance = parseCompliance(input.compliance, `${path}.compliance`);
  const status = parseStatus(input.status, `${path}.status`);
  const reason = input.reason === undefined ? undefined : requireNonEmptyString(input.reason, `${path}.reason`);
  return {
    schemaVersion: "1.0",
    harness,
    requested,
    ...(resolved ? { resolved } : {}),
    compliance,
    status,
    ...(reason ? { reason } : {}),
  };
}

function parseRequested(input: unknown, path: string): GoalModelResolution["requested"] {
  if (!isRecord(input)) throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["role", "modelScenario", "modelClass", "minimumRequirements"], path);
  const role = input.role === undefined ? undefined : requireNonEmptyString(input.role, `${path}.role`);
  const modelScenario = input.modelScenario === undefined ? undefined : requireNonEmptyString(input.modelScenario, `${path}.modelScenario`);
  const modelClass = requireNonEmptyString(input.modelClass, `${path}.modelClass`);
  const minimumRequirements = parseGoalModelMinimumRequirements(input.minimumRequirements, `${path}.minimumRequirements`);
  return {
    ...(role ? { role } : {}),
    ...(modelScenario ? { modelScenario } : {}),
    modelClass,
    minimumRequirements,
  };
}

function parseResolved(input: unknown, path: string): NonNullable<GoalModelResolution["resolved"]> {
  if (!isRecord(input)) throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["model", "bindingSource"], path);
  const model = requireNonEmptyString(input.model, `${path}.model`);
  const bindingSource = input.bindingSource === undefined ? undefined : requireNonEmptyString(input.bindingSource, `${path}.bindingSource`);
  return bindingSource ? { model, bindingSource } : { model };
}

function parseCompliance(input: unknown, path: string): GoalModelResolution["compliance"] {
  if (!isRecord(input)) throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["satisfiesMinimum", "downgraded", "missingCapabilities"], path);
  if (typeof input.satisfiesMinimum !== "boolean") throw new Error(`Invalid goal model resolution: ${path}.satisfiesMinimum must be boolean`);
  if (typeof input.downgraded !== "boolean") throw new Error(`Invalid goal model resolution: ${path}.downgraded must be boolean`);
  if (!Array.isArray(input.missingCapabilities)) throw new Error(`Invalid goal model resolution: ${path}.missingCapabilities must be an array`);
  return {
    satisfiesMinimum: input.satisfiesMinimum,
    downgraded: input.downgraded,
    missingCapabilities: input.missingCapabilities.map((item, index) => requireNonEmptyString(item, `${path}.missingCapabilities[${index}]`)),
  };
}

function parseStatus(input: unknown, path: string): GoalModelResolution["status"] {
  if (input !== "resolved" && input !== "blocked" && input !== "warn") throw new Error(`Invalid goal model resolution: ${path} must be resolved, blocked, or warn`);
  return input;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error(`Invalid value at ${path}: expected non-empty string`);
  return input.trim();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function assertKnownKeys(input: Record<string, unknown>, allowed: string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) throw new Error(`Invalid field at ${path}: ${JSON.stringify(key)} is not supported`);
  }
}
