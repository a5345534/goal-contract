const MODEL_CLASS_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
export function parseGoalModelClassCatalogJson(json, path = "modelClassCatalog") {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (error) {
        throw new Error(`Invalid goal model class catalog JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseGoalModelClassCatalog(parsed, path);
}
export function parseGoalModelClassCatalog(input, path = "modelClassCatalog") {
    if (!isRecord(input))
        throw new Error(`Invalid goal model class catalog: ${path} must be an object`);
    assertKnownKeys(input, ["version", "modelClasses"], path);
    if (input.version !== 1)
        throw new Error(`Invalid goal model class catalog: ${path}.version must be 1`);
    if (!isRecord(input.modelClasses))
        throw new Error(`Invalid goal model class catalog: ${path}.modelClasses must be an object`);
    const modelClasses = {};
    for (const [id, value] of Object.entries(input.modelClasses)) {
        const modelClassId = requireModelClassId(id, `${path}.modelClasses key`);
        modelClasses[modelClassId] = parseGoalModelClass(value, `${path}.modelClasses.${id}`);
    }
    if (Object.keys(modelClasses).length === 0)
        throw new Error(`Invalid goal model class catalog: ${path}.modelClasses must not be empty`);
    return { version: 1, modelClasses };
}
export function parseGoalModelClass(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model class catalog: ${path} must be an object`);
    assertKnownKeys(input, ["description", "minimumRequirements", "fallbackPolicy"], path);
    const minimumRequirements = parseGoalModelMinimumRequirements(input.minimumRequirements, `${path}.minimumRequirements`);
    const fallbackPolicy = parseGoalModelFallbackPolicy(input.fallbackPolicy, `${path}.fallbackPolicy`);
    const description = input.description === undefined ? undefined : requireNonEmptyString(input.description, `${path}.description`);
    return description ? { description, minimumRequirements, fallbackPolicy } : { minimumRequirements, fallbackPolicy };
}
export function parseGoalModelMinimumRequirements(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model minimum requirements: ${path} must be an object`);
    assertKnownKeys(input, ["reasoning", "contextWindowTokens", "toolUse", "structuredOutput", "formatFollowing", "sourceCitation", "costSensitivity", "privacy"], path);
    const out = {};
    if (input.reasoning !== undefined)
        out.reasoning = parseCapabilityLevel(input.reasoning, `${path}.reasoning`);
    if (input.contextWindowTokens !== undefined)
        out.contextWindowTokens = requirePositiveInteger(input.contextWindowTokens, `${path}.contextWindowTokens`);
    if (input.toolUse !== undefined)
        out.toolUse = parseEnum(input.toolUse, ["none", "optional", "required"], `${path}.toolUse`);
    if (input.structuredOutput !== undefined)
        out.structuredOutput = parseEnum(input.structuredOutput, ["none", "preferred", "strict"], `${path}.structuredOutput`);
    if (input.formatFollowing !== undefined)
        out.formatFollowing = parseCapabilityLevel(input.formatFollowing, `${path}.formatFollowing`);
    if (input.sourceCitation !== undefined)
        out.sourceCitation = parseEnum(input.sourceCitation, ["none", "preferred", "required"], `${path}.sourceCitation`);
    if (input.costSensitivity !== undefined)
        out.costSensitivity = parseEnum(input.costSensitivity, ["low", "medium", "high"], `${path}.costSensitivity`);
    if (input.privacy !== undefined)
        out.privacy = parseEnum(input.privacy, ["cloud-ok", "local-only"], `${path}.privacy`);
    return out;
}
export function parseGoalModelFallbackPolicy(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model fallback policy: ${path} must be an object`);
    assertKnownKeys(input, ["allowDowngrade", "onUnavailable"], path);
    if (typeof input.allowDowngrade !== "boolean")
        throw new Error(`Invalid goal model fallback policy: ${path}.allowDowngrade must be a boolean`);
    return {
        allowDowngrade: input.allowDowngrade,
        onUnavailable: parseEnum(input.onUnavailable, ["block", "warn", "fallback-to-implementation"], `${path}.onUnavailable`),
    };
}
export function requireKnownModelClass(catalog, modelClass, path = "modelClass") {
    if (!(modelClass in catalog.modelClasses))
        throw new Error(`Unknown modelClass at ${path}: ${JSON.stringify(modelClass)}`);
    return catalog.modelClasses[modelClass];
}
function requireModelClassId(input, path) {
    const value = requireNonEmptyString(input, path);
    if (!MODEL_CLASS_PATTERN.test(value))
        throw new Error(`Invalid model class id: ${path} must match ${MODEL_CLASS_PATTERN.source}`);
    return value;
}
function parseCapabilityLevel(input, path) {
    return parseEnum(input, ["none", "low", "medium", "high", "very_high"], path);
}
function parseEnum(input, values, path) {
    if (typeof input !== "string" || !values.includes(input)) {
        throw new Error(`Invalid value at ${path}: expected one of ${values.join(", ")}`);
    }
    return input;
}
function requirePositiveInteger(input, path) {
    if (!Number.isInteger(input) || input <= 0)
        throw new Error(`Invalid value at ${path}: expected positive integer`);
    return input;
}
function requireNonEmptyString(input, path) {
    if (typeof input !== "string" || !input.trim())
        throw new Error(`Invalid value at ${path}: expected non-empty string`);
    return input.trim();
}
function isRecord(input) {
    return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
function assertKnownKeys(input, allowed, path) {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(input)) {
        if (!allowedSet.has(key))
            throw new Error(`Invalid field at ${path}: ${JSON.stringify(key)} is not supported`);
    }
}
//# sourceMappingURL=model-class.js.map