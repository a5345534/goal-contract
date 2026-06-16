/**
 * Goal model-routing contract.
 *
 * Defines the canonical format for scenario-to-model routing tables
 * consumed by goal-dag and goal-runner.  Runtime model-resolution
 * functions such as `resolveControllerModelArg()` and
 * `selectModelScenarioForNode()` belong in goal-runner, not here.
 */

export type GoalDagRisk = "low" | "medium" | "high";

export const CANONICAL_MODEL_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:[-_.][a-z][a-z0-9]*)*\/[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

export interface GoalModelScenario {
  model: string;
  description?: string;
}

export interface GoalModelRoutingRuleMatch {
  nodeIds?: string[];
  scopes?: string[];
  risks?: GoalDagRisk[];
  modules?: string[];
  capabilities?: string[];
  files?: string[];
  objectiveIncludes?: string[];
  hasValidators?: boolean;
  hasOutputs?: boolean;
}

export interface GoalModelRoutingRule {
  scenario: string;
  when?: GoalModelRoutingRuleMatch;
}

export interface GoalModelRoutingConfig {
  scenarios: Record<string, GoalModelScenario>;
  controllerScenario?: string;
  defaultSubagentScenario?: string;
  rules?: GoalModelRoutingRule[];
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const SCENARIO_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

export function isCanonicalModelId(value: string): boolean {
  return CANONICAL_MODEL_ID_PATTERN.test(value);
}

export function requireCanonicalModelId(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!isCanonicalModelId(value)) {
    throw new Error(
      `Invalid model id at ${path}: ${JSON.stringify(value)} — ` +
        `expected canonical provider/model format, e.g. openai-codex/gpt-5.5`,
    );
  }
  return value;
}

/**
 * Parse and validate a goal model-routing configuration object.
 *
 * This is the pure contract parser: it checks structure, scenario ids,
 * canonical model id format, and referential integrity of scenario
 * references.  It does *not* resolve controller or per-node model
 * selections — that is runtime behaviour owned by goal-runner.
 */
export function parseGoalModelRoutingConfig(
  input: unknown,
  path = "modelRouting",
): GoalModelRoutingConfig {
  if (!isRecord(input)) {
    throw new Error(`Invalid goal model routing: ${path} must be an object`);
  }

  assertKnownKeys(
    input,
    ["scenarios", "controllerScenario", "defaultSubagentScenario", "rules"],
    path,
  );

  if (!isRecord(input.scenarios)) {
    throw new Error(`Invalid goal model routing: ${path}.scenarios must be an object`);
  }

  const scenarios: Record<string, GoalModelScenario> = {};
  for (const [name, value] of Object.entries(input.scenarios)) {
    const scenarioId = requireScenarioId(name, `${path}.scenarios key`);
    if (!isRecord(value)) {
      throw new Error(`Invalid goal model routing: ${path}.scenarios.${name} must be an object`);
    }

    assertKnownKeys(value, ["model", "description"], `${path}.scenarios.${name}`);

    const model = requireCanonicalModelId(
      value.model,
      `${path}.scenarios.${name}.model`,
    );
    const description =
      value.description === undefined
        ? undefined
        : requireNonEmptyString(value.description, `${path}.scenarios.${name}.description`);

    scenarios[scenarioId] = description ? { model, description } : { model };
  }

  if (Object.keys(scenarios).length === 0) {
    throw new Error(`Invalid goal model routing: ${path}.scenarios must not be empty`);
  }

  const controllerScenario =
    input.controllerScenario === undefined
      ? undefined
      : requireKnownScenario(
          input.controllerScenario,
          scenarios,
          `${path}.controllerScenario`,
        );

  const defaultSubagentScenario =
    input.defaultSubagentScenario === undefined
      ? undefined
      : requireKnownScenario(
          input.defaultSubagentScenario,
          scenarios,
          `${path}.defaultSubagentScenario`,
        );

  const rules =
    input.rules === undefined
      ? undefined
      : parseGoalModelRoutingRules(input.rules, scenarios, `${path}.rules`);

  return {
    scenarios,
    ...(controllerScenario ? { controllerScenario } : {}),
    ...(defaultSubagentScenario ? { defaultSubagentScenario } : {}),
    ...(rules ? { rules } : {}),
  };
}

export function parseGoalModelRoutingConfigJson(
  json: string,
  path = "modelRouting",
): GoalModelRoutingConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid goal model routing JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseGoalModelRoutingConfig(parsed, path);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseGoalModelRoutingRules(
  input: unknown,
  scenarios: Record<string, GoalModelScenario>,
  path: string,
): GoalModelRoutingRule[] {
  if (!Array.isArray(input)) {
    throw new Error(`Invalid goal model routing: ${path} must be an array`);
  }
  return input.map((item, index): GoalModelRoutingRule => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) throw new Error(`Invalid goal model routing: ${itemPath} must be an object`);
    assertKnownKeys(item, ["scenario", "when"], itemPath);
    const scenario = requireKnownScenario(
      item.scenario,
      scenarios,
      `${itemPath}.scenario`,
    );
    const when =
      item.when === undefined
        ? undefined
        : parseRuleMatch(item.when, `${itemPath}.when`);
    return when ? { scenario, when } : { scenario };
  });
}

function parseRuleMatch(
  input: unknown,
  path: string,
): GoalModelRoutingRuleMatch {
  if (!isRecord(input))
    throw new Error(`Invalid goal model routing: ${path} must be an object`);
  assertKnownKeys(
    input,
    [
      "nodeIds", "scopes", "risks", "modules", "capabilities",
      "files", "objectiveIncludes", "hasValidators", "hasOutputs",
    ],
    path,
  );
  const match: GoalModelRoutingRuleMatch = {};
  if (input.nodeIds !== undefined) match.nodeIds = parseStringArray(input.nodeIds, `${path}.nodeIds`);
  if (input.scopes !== undefined) match.scopes = parseStringArray(input.scopes, `${path}.scopes`);
  if (input.risks !== undefined) match.risks = parseRiskArray(input.risks, `${path}.risks`);
  if (input.modules !== undefined) match.modules = parseStringArray(input.modules, `${path}.modules`);
  if (input.capabilities !== undefined) match.capabilities = parseStringArray(input.capabilities, `${path}.capabilities`);
  if (input.files !== undefined) match.files = parseStringArray(input.files, `${path}.files`);
  if (input.objectiveIncludes !== undefined) match.objectiveIncludes = parseStringArray(input.objectiveIncludes, `${path}.objectiveIncludes`);
  if (input.hasValidators !== undefined) match.hasValidators = requireBoolean(input.hasValidators, `${path}.hasValidators`);
  if (input.hasOutputs !== undefined) match.hasOutputs = requireBoolean(input.hasOutputs, `${path}.hasOutputs`);
  return match;
}

function parseStringArray(input: unknown, path: string): string[] {
  if (!Array.isArray(input))
    throw new Error(`Invalid goal model routing: ${path} must be an array`);
  return input.map((item, index) => requireNonEmptyString(item, `${path}[${index}]`));
}

function parseRiskArray(input: unknown, path: string): GoalDagRisk[] {
  if (!Array.isArray(input))
    throw new Error(`Invalid goal model routing: ${path} must be an array`);
  return input.map((item, index): GoalDagRisk => {
    if (item !== "low" && item !== "medium" && item !== "high")
      throw new Error(`Invalid goal model routing: ${path}[${index}] must be low, medium, or high`);
    return item;
  });
}

function requireScenarioId(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (!SCENARIO_ID_PATTERN.test(value)) {
    throw new Error(
      `Invalid goal model routing: ${path} must match ${SCENARIO_ID_PATTERN.source}`,
    );
  }
  return value;
}

function requireKnownScenario(
  input: unknown,
  scenarios: Record<string, GoalModelScenario>,
  path: string,
): string {
  const value = requireNonEmptyString(input, path);
  if (!(value in scenarios)) {
    throw new Error(
      `Invalid goal model routing: ${path} references unknown scenario ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function requireBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean")
    throw new Error(`Invalid goal model routing: ${path} must be a boolean`);
  return input;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim())
    throw new Error(`Invalid goal model routing: ${path} must be a non-empty string`);
  return input.trim();
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
      throw new Error(
        `Invalid goal model routing: ${path} has unsupported field ${JSON.stringify(key)}`,
      );
    }
  }
}
