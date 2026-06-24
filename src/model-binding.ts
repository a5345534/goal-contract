import {
  parseGoalModelMinimumRequirements,
  type GoalModelClass,
  type GoalModelMinimumRequirements,
} from "./model-class.js";

export interface GoalModelBinding {
  model: string;
  declaredCapabilities: GoalModelMinimumRequirements;
  notes?: string;
}

export interface GoalModelBindingCatalog {
  version: 1;
  harness: string;
  bindings: Record<string, GoalModelBinding>;
}

export interface GoalModelBindingCompliance {
  satisfiesMinimum: boolean;
  downgraded: boolean;
  missingCapabilities: string[];
  status: "resolved" | "blocked" | "warn";
}

const BINDING_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

export function parseGoalModelBindingCatalogJson(json: string, path = "modelBindingCatalog"): GoalModelBindingCatalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid goal model binding catalog JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseGoalModelBindingCatalog(parsed, path);
}

export function parseGoalModelBindingCatalog(input: unknown, path = "modelBindingCatalog"): GoalModelBindingCatalog {
  if (!isRecord(input)) throw new Error(`Invalid goal model binding catalog: ${path} must be an object`);
  assertKnownKeys(input, ["version", "harness", "bindings"], path);
  if (input.version !== 1) throw new Error(`Invalid goal model binding catalog: ${path}.version must be 1`);
  const harness = requireNonEmptyString(input.harness, `${path}.harness`);
  if (!isRecord(input.bindings)) throw new Error(`Invalid goal model binding catalog: ${path}.bindings must be an object`);
  const bindings: Record<string, GoalModelBinding> = {};
  for (const [id, value] of Object.entries(input.bindings)) {
    const bindingId = requireBindingId(id, `${path}.bindings key`);
    bindings[bindingId] = parseGoalModelBinding(value, `${path}.bindings.${id}`);
  }
  if (Object.keys(bindings).length === 0) throw new Error(`Invalid goal model binding catalog: ${path}.bindings must not be empty`);
  return { version: 1, harness, bindings };
}

export function parseGoalModelBinding(input: unknown, path: string): GoalModelBinding {
  if (!isRecord(input)) throw new Error(`Invalid goal model binding: ${path} must be an object`);
  assertKnownKeys(input, ["model", "declaredCapabilities", "notes"], path);
  const model = requireNonEmptyString(input.model, `${path}.model`);
  const declaredCapabilities = parseGoalModelMinimumRequirements(input.declaredCapabilities, `${path}.declaredCapabilities`);
  const notes = input.notes === undefined ? undefined : requireNonEmptyString(input.notes, `${path}.notes`);
  return notes ? { model, declaredCapabilities, notes } : { model, declaredCapabilities };
}

export function evaluateGoalModelBindingCompliance(
  modelClass: GoalModelClass,
  binding: GoalModelBinding,
): GoalModelBindingCompliance {
  const missingCapabilities = missingMinimumCapabilities(modelClass.minimumRequirements, binding.declaredCapabilities);
  const satisfiesMinimum = missingCapabilities.length === 0;
  const downgraded = !satisfiesMinimum;
  if (satisfiesMinimum) return { satisfiesMinimum, downgraded: false, missingCapabilities: [], status: "resolved" };
  if (
    modelClass.fallbackPolicy.allowDowngrade &&
    (modelClass.fallbackPolicy.onUnavailable === "warn" || modelClass.fallbackPolicy.onUnavailable === "fallback-to-implementation")
  ) {
    return { satisfiesMinimum, downgraded, missingCapabilities, status: "warn" };
  }
  return { satisfiesMinimum, downgraded, missingCapabilities, status: "blocked" };
}

export function missingMinimumCapabilities(
  minimum: GoalModelMinimumRequirements,
  declared: GoalModelMinimumRequirements,
): string[] {
  const missing: string[] = [];
  if (minimum.reasoning !== undefined && compareCapabilityLevel(declared.reasoning ?? "none", minimum.reasoning) < 0) missing.push("reasoning");
  if (minimum.contextWindowTokens !== undefined && (declared.contextWindowTokens ?? 0) < minimum.contextWindowTokens) missing.push("contextWindowTokens");
  if (minimum.toolUse !== undefined && compareOrdered(declared.toolUse ?? "none", minimum.toolUse, ["none", "optional", "required"]) < 0) missing.push("toolUse");
  if (minimum.structuredOutput !== undefined && compareOrdered(declared.structuredOutput ?? "none", minimum.structuredOutput, ["none", "preferred", "strict"]) < 0) missing.push("structuredOutput");
  if (minimum.formatFollowing !== undefined && compareCapabilityLevel(declared.formatFollowing ?? "none", minimum.formatFollowing) < 0) missing.push("formatFollowing");
  if (minimum.sourceCitation !== undefined && compareOrdered(declared.sourceCitation ?? "none", minimum.sourceCitation, ["none", "preferred", "required"]) < 0) missing.push("sourceCitation");
  if (minimum.privacy !== undefined && declared.privacy !== minimum.privacy) missing.push("privacy");
  // costSensitivity is advisory in the shared contract and does not make a binding under-capable.
  return [...new Set(missing)];
}

function compareCapabilityLevel(left: string, right: string): number {
  return compareOrdered(left, right, ["none", "low", "medium", "high", "very_high"]);
}

function compareOrdered(left: string, right: string, order: readonly string[]): number {
  return order.indexOf(left) - order.indexOf(right);
}

function requireBindingId(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!BINDING_ID_PATTERN.test(value)) throw new Error(`Invalid model binding id: ${path} must match ${BINDING_ID_PATTERN.source}`);
  return value;
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
