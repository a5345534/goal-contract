import { parseGoalModelMinimumRequirements, } from "./model-class.js";
const BINDING_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
export function parseGoalModelBindingCatalogJson(json, path = "modelBindingCatalog") {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (error) {
        throw new Error(`Invalid goal model binding catalog JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseGoalModelBindingCatalog(parsed, path);
}
export function parseGoalModelBindingCatalog(input, path = "modelBindingCatalog") {
    if (!isRecord(input))
        throw new Error(`Invalid goal model binding catalog: ${path} must be an object`);
    assertKnownKeys(input, ["version", "harness", "bindings"], path);
    const version = parseCatalogVersion(input.version, `${path}.version`);
    const harness = requireNonEmptyString(input.harness, `${path}.harness`);
    if (!isRecord(input.bindings))
        throw new Error(`Invalid goal model binding catalog: ${path}.bindings must be an object`);
    const bindings = {};
    for (const [id, value] of Object.entries(input.bindings)) {
        const bindingId = requireBindingId(id, `${path}.bindings key`);
        bindings[bindingId] = parseGoalModelBinding(value, `${path}.bindings.${id}`, version);
    }
    if (Object.keys(bindings).length === 0)
        throw new Error(`Invalid goal model binding catalog: ${path}.bindings must not be empty`);
    return { version, harness, bindings };
}
export function parseNormalizedGoalModelBindingCatalog(input, path = "modelBindingCatalog") {
    return normalizeGoalModelBindingCatalog(parseGoalModelBindingCatalog(input, path), path);
}
export function parseGoalModelBinding(input, path, version = 2) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model binding: ${path} must be an object`);
    if ("candidates" in input) {
        if (version !== 2)
            throw new Error(`Invalid goal model binding: ${path}.candidates requires catalog version 2`);
        return parseGoalModelCandidateChainBinding(input, path);
    }
    return parseGoalModelSingleBinding(input, path);
}
export function normalizeGoalModelBinding(binding, path = "modelBinding") {
    if (isGoalModelCandidateChainBinding(binding)) {
        if (binding.candidates.length === 0)
            throw new Error(`Invalid goal model binding: ${path}.candidates must not be empty`);
        return {
            candidates: binding.candidates.map((candidate, index) => normalizeGoalModelBindingCandidate(candidate, `${path}.candidates[${index}]`)),
            ...(binding.retryPolicy ? { retryPolicy: { ...binding.retryPolicy } } : {}),
            ...(binding.notes ? { notes: binding.notes } : {}),
        };
    }
    return {
        candidates: [normalizeGoalModelBindingCandidate(binding, path)],
    };
}
export function normalizeGoalModelBindingCatalog(catalog, path = "modelBindingCatalog") {
    const bindings = {};
    for (const [id, binding] of Object.entries(catalog.bindings)) {
        bindings[id] = normalizeGoalModelBinding(binding, `${path}.bindings.${id}`);
    }
    if (Object.keys(bindings).length === 0)
        throw new Error(`Invalid goal model binding catalog: ${path}.bindings must not be empty`);
    return { version: catalog.version, harness: catalog.harness, bindings };
}
export function getGoalModelBindingCandidates(binding, path = "modelBinding") {
    return normalizeGoalModelBinding(binding, path).candidates;
}
export function evaluateGoalModelBindingCompliance(modelClass, binding) {
    return evaluateGoalModelBindingCandidateCompliance(modelClass, binding);
}
export function evaluateGoalModelBindingCandidateCompliance(modelClass, candidate) {
    const missingCapabilities = missingMinimumCapabilities(modelClass.minimumRequirements, candidate.declaredCapabilities);
    const satisfiesMinimum = missingCapabilities.length === 0;
    const downgraded = !satisfiesMinimum;
    if (satisfiesMinimum)
        return { satisfiesMinimum, downgraded: false, missingCapabilities: [], status: "resolved" };
    if (modelClass.fallbackPolicy.allowDowngrade &&
        (modelClass.fallbackPolicy.onUnavailable === "warn" || modelClass.fallbackPolicy.onUnavailable === "fallback-to-implementation")) {
        return { satisfiesMinimum, downgraded, missingCapabilities, status: "warn" };
    }
    return { satisfiesMinimum, downgraded, missingCapabilities, status: "blocked" };
}
export function evaluateGoalModelBindingCandidateChainCompliance(modelClass, binding) {
    return normalizeGoalModelBinding(binding).candidates.map((candidate, candidateIndex) => ({
        candidateIndex,
        model: candidate.model,
        ...evaluateGoalModelBindingCandidateCompliance(modelClass, candidate),
    }));
}
export function missingMinimumCapabilities(minimum, declared) {
    const missing = [];
    if (minimum.reasoning !== undefined && compareCapabilityLevel(declared.reasoning ?? "none", minimum.reasoning) < 0)
        missing.push("reasoning");
    if (minimum.contextWindowTokens !== undefined && (declared.contextWindowTokens ?? 0) < minimum.contextWindowTokens)
        missing.push("contextWindowTokens");
    if (minimum.toolUse !== undefined && compareOrdered(declared.toolUse ?? "none", minimum.toolUse, ["none", "optional", "required"]) < 0)
        missing.push("toolUse");
    if (minimum.structuredOutput !== undefined && compareOrdered(declared.structuredOutput ?? "none", minimum.structuredOutput, ["none", "preferred", "strict"]) < 0)
        missing.push("structuredOutput");
    if (minimum.formatFollowing !== undefined && compareCapabilityLevel(declared.formatFollowing ?? "none", minimum.formatFollowing) < 0)
        missing.push("formatFollowing");
    if (minimum.sourceCitation !== undefined && compareOrdered(declared.sourceCitation ?? "none", minimum.sourceCitation, ["none", "preferred", "required"]) < 0)
        missing.push("sourceCitation");
    if (minimum.privacy !== undefined && declared.privacy !== minimum.privacy)
        missing.push("privacy");
    // costSensitivity is advisory in the shared contract and does not make a binding under-capable.
    return [...new Set(missing)];
}
function parseCatalogVersion(input, path) {
    if (input !== 1 && input !== 2)
        throw new Error(`Invalid goal model binding catalog: ${path} must be 1 or 2`);
    return input;
}
function parseGoalModelSingleBinding(input, path) {
    assertKnownKeys(input, ["model", "declaredCapabilities", "notes"], path);
    return parseGoalModelBindingCandidate(input, path);
}
function parseGoalModelCandidateChainBinding(input, path) {
    assertKnownKeys(input, ["candidates", "retryPolicy", "notes"], path);
    if (!Array.isArray(input.candidates))
        throw new Error(`Invalid goal model binding: ${path}.candidates must be an array`);
    if (input.candidates.length === 0)
        throw new Error(`Invalid goal model binding: ${path}.candidates must not be empty`);
    const candidates = input.candidates.map((candidate, index) => parseGoalModelBindingCandidate(candidate, `${path}.candidates[${index}]`));
    const retryPolicy = input.retryPolicy === undefined ? undefined : parseRetryPolicy(input.retryPolicy, `${path}.retryPolicy`);
    const notes = input.notes === undefined ? undefined : requireNonEmptyString(input.notes, `${path}.notes`);
    return {
        candidates,
        ...(retryPolicy ? { retryPolicy } : {}),
        ...(notes ? { notes } : {}),
    };
}
function parseGoalModelBindingCandidate(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model binding candidate: ${path} must be an object`);
    assertKnownKeys(input, ["model", "declaredCapabilities", "notes"], path);
    const model = requireNonEmptyString(input.model, `${path}.model`);
    const declaredCapabilities = parseGoalModelMinimumRequirements(input.declaredCapabilities, `${path}.declaredCapabilities`);
    const notes = input.notes === undefined ? undefined : requireNonEmptyString(input.notes, `${path}.notes`);
    return notes ? { model, declaredCapabilities, notes } : { model, declaredCapabilities };
}
function parseRetryPolicy(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model binding retry policy: ${path} must be an object`);
    assertKnownKeys(input, ["attemptsPerCandidate"], path);
    const attemptsPerCandidate = input.attemptsPerCandidate;
    if (typeof attemptsPerCandidate !== "number" || !Number.isInteger(attemptsPerCandidate) || attemptsPerCandidate < 1) {
        throw new Error(`Invalid goal model binding retry policy: ${path}.attemptsPerCandidate must be a positive integer`);
    }
    return { attemptsPerCandidate };
}
function normalizeGoalModelBindingCandidate(candidate, path) {
    return parseGoalModelBindingCandidate(candidate, path);
}
function isGoalModelCandidateChainBinding(binding) {
    return "candidates" in binding;
}
function compareCapabilityLevel(left, right) {
    return compareOrdered(left, right, ["none", "low", "medium", "high", "very_high"]);
}
function compareOrdered(left, right, order) {
    return order.indexOf(left) - order.indexOf(right);
}
function requireBindingId(input, path) {
    const value = requireNonEmptyString(input, path);
    if (!BINDING_ID_PATTERN.test(value))
        throw new Error(`Invalid model binding id: ${path} must match ${BINDING_ID_PATTERN.source}`);
    return value;
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
//# sourceMappingURL=model-binding.js.map