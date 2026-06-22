export type ModelCapabilityLevel = "none" | "low" | "medium" | "high" | "very_high";

export interface GoalModelMinimumRequirements {
  reasoning?: ModelCapabilityLevel;
  contextWindowTokens?: number;
  toolUse?: "none" | "optional" | "required";
  structuredOutput?: "none" | "preferred" | "strict";
  formatFollowing?: ModelCapabilityLevel;
  sourceCitation?: "none" | "preferred" | "required";
  costSensitivity?: "low" | "medium" | "high";
  privacy?: "cloud-ok" | "local-only";
}

export interface GoalModelFallbackPolicy {
  allowDowngrade: boolean;
  onUnavailable: "block" | "warn";
}

export interface GoalModelClass {
  description?: string;
  minimumRequirements: GoalModelMinimumRequirements;
  fallbackPolicy: GoalModelFallbackPolicy;
}

export interface GoalModelClassCatalog {
  version: 1;
  modelClasses: Record<string, GoalModelClass>;
}

const MODEL_CLASS_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

export function parseGoalModelClassCatalogJson(json: string, path = "modelClassCatalog"): GoalModelClassCatalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid goal model class catalog JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseGoalModelClassCatalog(parsed, path);
}

export function parseGoalModelClassCatalog(input: unknown, path = "modelClassCatalog"): GoalModelClassCatalog {
  if (!isRecord(input)) throw new Error(`Invalid goal model class catalog: ${path} must be an object`);
  assertKnownKeys(input, ["version", "modelClasses"], path);
  if (input.version !== 1) throw new Error(`Invalid goal model class catalog: ${path}.version must be 1`);
  if (!isRecord(input.modelClasses)) throw new Error(`Invalid goal model class catalog: ${path}.modelClasses must be an object`);
  const modelClasses: Record<string, GoalModelClass> = {};
  for (const [id, value] of Object.entries(input.modelClasses)) {
    const modelClassId = requireModelClassId(id, `${path}.modelClasses key`);
    modelClasses[modelClassId] = parseGoalModelClass(value, `${path}.modelClasses.${id}`);
  }
  if (Object.keys(modelClasses).length === 0) throw new Error(`Invalid goal model class catalog: ${path}.modelClasses must not be empty`);
  return { version: 1, modelClasses };
}

export function parseGoalModelClass(input: unknown, path: string): GoalModelClass {
  if (!isRecord(input)) throw new Error(`Invalid goal model class catalog: ${path} must be an object`);
  assertKnownKeys(input, ["description", "minimumRequirements", "fallbackPolicy"], path);
  const minimumRequirements = parseGoalModelMinimumRequirements(input.minimumRequirements, `${path}.minimumRequirements`);
  const fallbackPolicy = parseGoalModelFallbackPolicy(input.fallbackPolicy, `${path}.fallbackPolicy`);
  const description = input.description === undefined ? undefined : requireNonEmptyString(input.description, `${path}.description`);
  return description ? { description, minimumRequirements, fallbackPolicy } : { minimumRequirements, fallbackPolicy };
}

export function parseGoalModelMinimumRequirements(input: unknown, path: string): GoalModelMinimumRequirements {
  if (!isRecord(input)) throw new Error(`Invalid goal model minimum requirements: ${path} must be an object`);
  assertKnownKeys(input, ["reasoning", "contextWindowTokens", "toolUse", "structuredOutput", "formatFollowing", "sourceCitation", "costSensitivity", "privacy"], path);
  const out: GoalModelMinimumRequirements = {};
  if (input.reasoning !== undefined) out.reasoning = parseCapabilityLevel(input.reasoning, `${path}.reasoning`);
  if (input.contextWindowTokens !== undefined) out.contextWindowTokens = requirePositiveInteger(input.contextWindowTokens, `${path}.contextWindowTokens`);
  if (input.toolUse !== undefined) out.toolUse = parseEnum(input.toolUse, ["none", "optional", "required"] as const, `${path}.toolUse`);
  if (input.structuredOutput !== undefined) out.structuredOutput = parseEnum(input.structuredOutput, ["none", "preferred", "strict"] as const, `${path}.structuredOutput`);
  if (input.formatFollowing !== undefined) out.formatFollowing = parseCapabilityLevel(input.formatFollowing, `${path}.formatFollowing`);
  if (input.sourceCitation !== undefined) out.sourceCitation = parseEnum(input.sourceCitation, ["none", "preferred", "required"] as const, `${path}.sourceCitation`);
  if (input.costSensitivity !== undefined) out.costSensitivity = parseEnum(input.costSensitivity, ["low", "medium", "high"] as const, `${path}.costSensitivity`);
  if (input.privacy !== undefined) out.privacy = parseEnum(input.privacy, ["cloud-ok", "local-only"] as const, `${path}.privacy`);
  return out;
}

export function parseGoalModelFallbackPolicy(input: unknown, path: string): GoalModelFallbackPolicy {
  if (!isRecord(input)) throw new Error(`Invalid goal model fallback policy: ${path} must be an object`);
  assertKnownKeys(input, ["allowDowngrade", "onUnavailable"], path);
  if (typeof input.allowDowngrade !== "boolean") throw new Error(`Invalid goal model fallback policy: ${path}.allowDowngrade must be a boolean`);
  return {
    allowDowngrade: input.allowDowngrade,
    onUnavailable: parseEnum(input.onUnavailable, ["block", "warn"] as const, `${path}.onUnavailable`),
  };
}

export function requireKnownModelClass(catalog: GoalModelClassCatalog, modelClass: string, path = "modelClass"): GoalModelClass {
  if (!(modelClass in catalog.modelClasses)) throw new Error(`Unknown modelClass at ${path}: ${JSON.stringify(modelClass)}`);
  return catalog.modelClasses[modelClass]!;
}

function requireModelClassId(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!MODEL_CLASS_PATTERN.test(value)) throw new Error(`Invalid model class id: ${path} must match ${MODEL_CLASS_PATTERN.source}`);
  return value;
}

function parseCapabilityLevel(input: unknown, path: string): ModelCapabilityLevel {
  return parseEnum(input, ["none", "low", "medium", "high", "very_high"] as const, path);
}

function parseEnum<T extends string>(input: unknown, values: readonly T[], path: string): T {
  if (typeof input !== "string" || !(values as readonly string[]).includes(input)) {
    throw new Error(`Invalid value at ${path}: expected one of ${values.join(", ")}`);
  }
  return input as T;
}

function requirePositiveInteger(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) <= 0) throw new Error(`Invalid value at ${path}: expected positive integer`);
  return input as number;
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
