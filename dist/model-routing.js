/**
 * Goal model-routing contract.
 *
 * Shared DAG-level routing is intentionally abstract: producers choose
 * scenario ids and modelClass values, while concrete provider/model ids are
 * harness binding data resolved by goal-runner/adapters at runtime.
 */
// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
const SCENARIO_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const MODEL_CLASS_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
/**
 * Parse and validate a goal model-routing configuration object.
 *
 * This parser rejects legacy concrete model routing (`scenario.model`) and
 * accepts only `scenario.modelClass`. Concrete model ids belong in harness
 * binding catalogs, not DAG runtime JSON or shared routing config.
 */
export function parseGoalModelRoutingConfig(input, path = "modelRouting") {
    if (!isRecord(input)) {
        throw new Error(`Invalid goal model routing: ${path} must be an object`);
    }
    assertKnownKeys(input, ["scenarios", "controllerScenario", "defaultSubagentScenario", "rules"], path);
    if (!isRecord(input.scenarios)) {
        throw new Error(`Invalid goal model routing: ${path}.scenarios must be an object`);
    }
    const scenarios = {};
    for (const [name, value] of Object.entries(input.scenarios)) {
        const scenarioId = requireScenarioId(name, `${path}.scenarios key`);
        if (!isRecord(value)) {
            throw new Error(`Invalid goal model routing: ${path}.scenarios.${name} must be an object`);
        }
        assertKnownKeys(value, ["modelClass", "description"], `${path}.scenarios.${name}`);
        const modelClass = requireModelClass(value.modelClass, `${path}.scenarios.${name}.modelClass`);
        const description = value.description === undefined
            ? undefined
            : requireNonEmptyString(value.description, `${path}.scenarios.${name}.description`);
        scenarios[scenarioId] = description ? { modelClass, description } : { modelClass };
    }
    if (Object.keys(scenarios).length === 0) {
        throw new Error(`Invalid goal model routing: ${path}.scenarios must not be empty`);
    }
    const controllerScenario = input.controllerScenario === undefined
        ? undefined
        : requireKnownScenario(input.controllerScenario, scenarios, `${path}.controllerScenario`);
    const defaultSubagentScenario = input.defaultSubagentScenario === undefined
        ? undefined
        : requireKnownScenario(input.defaultSubagentScenario, scenarios, `${path}.defaultSubagentScenario`);
    const rules = input.rules === undefined
        ? undefined
        : parseGoalModelRoutingRules(input.rules, scenarios, `${path}.rules`);
    return {
        scenarios,
        ...(controllerScenario ? { controllerScenario } : {}),
        ...(defaultSubagentScenario ? { defaultSubagentScenario } : {}),
        ...(rules ? { rules } : {}),
    };
}
export function parseGoalModelRoutingConfigJson(json, path = "modelRouting") {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (error) {
        throw new Error(`Invalid goal model routing JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseGoalModelRoutingConfig(parsed, path);
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function parseGoalModelRoutingRules(input, scenarios, path) {
    if (!Array.isArray(input)) {
        throw new Error(`Invalid goal model routing: ${path} must be an array`);
    }
    return input.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isRecord(item))
            throw new Error(`Invalid goal model routing: ${itemPath} must be an object`);
        assertKnownKeys(item, ["scenario", "when"], itemPath);
        const scenario = requireKnownScenario(item.scenario, scenarios, `${itemPath}.scenario`);
        const when = item.when === undefined
            ? undefined
            : parseRuleMatch(item.when, `${itemPath}.when`);
        return when ? { scenario, when } : { scenario };
    });
}
function parseRuleMatch(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model routing: ${path} must be an object`);
    assertKnownKeys(input, [
        "nodeIds", "scopes", "risks", "modules", "capabilities",
        "files", "objectiveIncludes", "hasValidators", "hasOutputs",
    ], path);
    const match = {};
    if (input.nodeIds !== undefined)
        match.nodeIds = parseStringArray(input.nodeIds, `${path}.nodeIds`);
    if (input.scopes !== undefined)
        match.scopes = parseStringArray(input.scopes, `${path}.scopes`);
    if (input.risks !== undefined)
        match.risks = parseRiskArray(input.risks, `${path}.risks`);
    if (input.modules !== undefined)
        match.modules = parseStringArray(input.modules, `${path}.modules`);
    if (input.capabilities !== undefined)
        match.capabilities = parseStringArray(input.capabilities, `${path}.capabilities`);
    if (input.files !== undefined)
        match.files = parseStringArray(input.files, `${path}.files`);
    if (input.objectiveIncludes !== undefined)
        match.objectiveIncludes = parseStringArray(input.objectiveIncludes, `${path}.objectiveIncludes`);
    if (input.hasValidators !== undefined)
        match.hasValidators = requireBoolean(input.hasValidators, `${path}.hasValidators`);
    if (input.hasOutputs !== undefined)
        match.hasOutputs = requireBoolean(input.hasOutputs, `${path}.hasOutputs`);
    return match;
}
function parseStringArray(input, path) {
    if (!Array.isArray(input))
        throw new Error(`Invalid goal model routing: ${path} must be an array`);
    return input.map((item, index) => requireNonEmptyString(item, `${path}[${index}]`));
}
function parseRiskArray(input, path) {
    if (!Array.isArray(input))
        throw new Error(`Invalid goal model routing: ${path} must be an array`);
    return input.map((item, index) => {
        if (item !== "low" && item !== "medium" && item !== "high")
            throw new Error(`Invalid goal model routing: ${path}[${index}] must be low, medium, or high`);
        return item;
    });
}
function requireScenarioId(input, path) {
    const value = requireNonEmptyString(input, path);
    if (!SCENARIO_ID_PATTERN.test(value)) {
        throw new Error(`Invalid goal model routing: ${path} must match ${SCENARIO_ID_PATTERN.source}`);
    }
    return value;
}
function requireModelClass(input, path) {
    const value = requireNonEmptyString(input, path);
    if (!MODEL_CLASS_PATTERN.test(value)) {
        throw new Error(`Invalid goal model routing: ${path} must match ${MODEL_CLASS_PATTERN.source}`);
    }
    return value;
}
function requireKnownScenario(input, scenarios, path) {
    const value = requireNonEmptyString(input, path);
    if (!(value in scenarios)) {
        throw new Error(`Invalid goal model routing: ${path} references unknown scenario ${JSON.stringify(value)}`);
    }
    return value;
}
function requireBoolean(input, path) {
    if (typeof input !== "boolean")
        throw new Error(`Invalid goal model routing: ${path} must be a boolean`);
    return input;
}
function requireNonEmptyString(input, path) {
    if (typeof input !== "string" || !input.trim())
        throw new Error(`Invalid goal model routing: ${path} must be a non-empty string`);
    return input.trim();
}
function isRecord(input) {
    return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
function assertKnownKeys(input, allowed, path) {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(input)) {
        if (!allowedSet.has(key)) {
            if (key === "model") {
                throw new Error(`Invalid goal model routing: ${path}.model is unsupported; use modelClass`);
            }
            throw new Error(`Invalid goal model routing: ${path} has unsupported field ${JSON.stringify(key)}`);
        }
    }
}
//# sourceMappingURL=model-routing.js.map