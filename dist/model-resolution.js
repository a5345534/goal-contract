import { parseGoalModelMinimumRequirements, } from "./model-class.js";
import { evaluateGoalModelBindingCandidateCompliance, getGoalModelBindingCandidates, } from "./model-binding.js";
// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------
const ATTEMPTED_CANDIDATE_STATUS_VALUES = ["succeeded", "failed", "skipped", "error"];
export function parseGoalModelResolutionJson(json, path = "modelResolution") {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (error) {
        throw new Error(`Invalid goal model resolution JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseGoalModelResolution(parsed, path);
}
export function parseGoalModelResolution(input, path = "modelResolution") {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, [
        "schemaVersion",
        "harness",
        "requested",
        "resolved",
        "compliance",
        "attemptedCandidates",
        "switchEvents",
        "exhaustedChain",
        "status",
        "reason",
    ], path);
    if (input.schemaVersion !== "1.0")
        throw new Error(`Invalid goal model resolution: ${path}.schemaVersion must be "1.0"`);
    const harness = requireNonEmptyString(input.harness, `${path}.harness`);
    const requested = parseRequested(input.requested, `${path}.requested`);
    const resolved = input.resolved === undefined
        ? undefined
        : parseResolved(input.resolved, `${path}.resolved`);
    const compliance = parseCompliance(input.compliance, `${path}.compliance`);
    const attemptedCandidates = input.attemptedCandidates === undefined
        ? undefined
        : parseAttemptedCandidates(input.attemptedCandidates, `${path}.attemptedCandidates`);
    const switchEvents = input.switchEvents === undefined
        ? undefined
        : parseSwitchEvents(input.switchEvents, `${path}.switchEvents`);
    const exhaustedChain = input.exhaustedChain === undefined
        ? undefined
        : requireBoolean(input.exhaustedChain, `${path}.exhaustedChain`);
    const status = parseStatus(input.status, `${path}.status`);
    const reason = input.reason === undefined
        ? undefined
        : requireNonEmptyString(input.reason, `${path}.reason`);
    return {
        schemaVersion: "1.0",
        harness,
        requested,
        ...(resolved ? { resolved } : {}),
        compliance,
        ...(attemptedCandidates ? { attemptedCandidates } : {}),
        ...(switchEvents ? { switchEvents } : {}),
        ...(exhaustedChain !== undefined ? { exhaustedChain } : {}),
        status,
        ...(reason ? { reason } : {}),
    };
}
// ---------------------------------------------------------------------------
// Derived evaluation — build resolution evidence from a model class and
// binding
// ---------------------------------------------------------------------------
/**
 * Evaluate a candidate chain binding against a model class and produce
 * the full resolution evidence fields (attemptedCandidates, switchEvents,
 * exhaustedChain, resolved.candidateIndex).
 *
 * This is a pure evaluation function that simulates first-match-wins
 * fallback: it walks candidates in order, appending attempt records,
 * and stops at the first candidate whose compliance status is
 * `"resolved"` or `"warn"` (depending on the fallback policy).  If no
 * candidate satisfies, all are recorded as `"failed"` and
 * `exhaustedChain` is set to true.
 *
 * Returns the resolution-level evidence that the resolver should embed
 * in the final `GoalModelResolution`.
 */
export function evaluateGoalModelResolutionCandidates(modelClass, binding) {
    const candidates = getGoalModelBindingCandidates(binding);
    const attemptedCandidates = [];
    const switchEvents = [];
    let resolvedCandidateIndex;
    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        const compliance = evaluateGoalModelBindingCandidateCompliance(modelClass, candidate);
        // Record the attempt
        const attempt = {
            candidateIndex: index,
            model: candidate.model,
            compliance: {
                satisfiesMinimum: compliance.satisfiesMinimum,
                downgraded: compliance.downgraded,
                missingCapabilities: compliance.missingCapabilities,
            },
            status: compliance.status === "resolved" ? "succeeded" : "failed",
        };
        if (compliance.status === "warn" &&
            modelClass.fallbackPolicy.onUnavailable === "warn") {
            // warn policy accepts downgraded candidates
            attempt.status = "succeeded";
        }
        if (compliance.status === "warn" &&
            modelClass.fallbackPolicy.onUnavailable === "fallback-to-implementation") {
            // fallback-to-implementation also accepts downgraded candidates
            attempt.status = "succeeded";
        }
        if (!compliance.satisfiesMinimum) {
            attempt.reason = `missing capabilities: ${compliance.missingCapabilities.join(", ")}`;
        }
        attemptedCandidates.push(attempt);
        if (attempt.status === "succeeded") {
            resolvedCandidateIndex = index;
            break;
        }
        // Record switch to next candidate if available
        if (index + 1 < candidates.length) {
            switchEvents.push({
                fromCandidateIndex: index,
                fromModel: candidate.model,
                toCandidateIndex: index + 1,
                toModel: candidates[index + 1].model,
                reason: "candidate_failed_compliance",
            });
        }
    }
    const exhaustedChain = resolvedCandidateIndex === undefined && candidates.length > 0;
    return {
        attemptedCandidates,
        switchEvents,
        exhaustedChain,
        resolvedCandidateIndex,
    };
}
// ---------------------------------------------------------------------------
// Internal parse helpers
// ---------------------------------------------------------------------------
function parseRequested(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, ["role", "modelScenario", "modelClass", "minimumRequirements"], path);
    const role = input.role === undefined
        ? undefined
        : requireNonEmptyString(input.role, `${path}.role`);
    const modelScenario = input.modelScenario === undefined
        ? undefined
        : requireNonEmptyString(input.modelScenario, `${path}.modelScenario`);
    const modelClass = requireNonEmptyString(input.modelClass, `${path}.modelClass`);
    const minimumRequirements = parseGoalModelMinimumRequirements(input.minimumRequirements, `${path}.minimumRequirements`);
    return {
        ...(role ? { role } : {}),
        ...(modelScenario ? { modelScenario } : {}),
        modelClass,
        minimumRequirements,
    };
}
function parseResolved(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, ["model", "bindingSource", "candidateIndex"], path);
    const model = requireNonEmptyString(input.model, `${path}.model`);
    const bindingSource = input.bindingSource === undefined
        ? undefined
        : requireNonEmptyString(input.bindingSource, `${path}.bindingSource`);
    const candidateIndex = input.candidateIndex === undefined
        ? undefined
        : requireNonNegativeInteger(input.candidateIndex, `${path}.candidateIndex`);
    const result = { model };
    if (bindingSource !== undefined)
        result.bindingSource = bindingSource;
    if (candidateIndex !== undefined)
        result.candidateIndex = candidateIndex;
    return result;
}
function parseCompliance(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, ["satisfiesMinimum", "downgraded", "missingCapabilities"], path);
    if (typeof input.satisfiesMinimum !== "boolean")
        throw new Error(`Invalid goal model resolution: ${path}.satisfiesMinimum must be boolean`);
    if (typeof input.downgraded !== "boolean")
        throw new Error(`Invalid goal model resolution: ${path}.downgraded must be boolean`);
    if (!Array.isArray(input.missingCapabilities))
        throw new Error(`Invalid goal model resolution: ${path}.missingCapabilities must be an array`);
    return {
        satisfiesMinimum: input.satisfiesMinimum,
        downgraded: input.downgraded,
        missingCapabilities: input.missingCapabilities.map((item, index) => requireNonEmptyString(item, `${path}.missingCapabilities[${index}]`)),
    };
}
function parseAttemptedCandidates(input, path) {
    if (!Array.isArray(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an array`);
    if (input.length === 0)
        throw new Error(`Invalid goal model resolution: ${path} must not be empty`);
    return input.map((item, index) => parseAttemptedCandidate(item, `${path}[${index}]`));
}
function parseAttemptedCandidate(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, ["candidateIndex", "model", "compliance", "status", "reason"], path);
    const candidateIndex = requireNonNegativeInteger(input.candidateIndex, `${path}.candidateIndex`);
    const model = requireNonEmptyString(input.model, `${path}.model`);
    const compliance = parseAttemptCompliance(input.compliance, `${path}.compliance`);
    const status = parseEnum(input.status, ATTEMPTED_CANDIDATE_STATUS_VALUES, `${path}.status`);
    const reason = input.reason === undefined
        ? undefined
        : requireNonEmptyString(input.reason, `${path}.reason`);
    const result = {
        candidateIndex,
        model,
        compliance,
        status,
    };
    if (reason !== undefined)
        result.reason = reason;
    return result;
}
function parseAttemptCompliance(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, ["satisfiesMinimum", "downgraded", "missingCapabilities"], path);
    if (typeof input.satisfiesMinimum !== "boolean")
        throw new Error(`Invalid goal model resolution: ${path}.satisfiesMinimum must be boolean`);
    if (typeof input.downgraded !== "boolean")
        throw new Error(`Invalid goal model resolution: ${path}.downgraded must be boolean`);
    if (!Array.isArray(input.missingCapabilities))
        throw new Error(`Invalid goal model resolution: ${path}.missingCapabilities must be an array`);
    return {
        satisfiesMinimum: input.satisfiesMinimum,
        downgraded: input.downgraded,
        missingCapabilities: input.missingCapabilities.map((item, index) => requireNonEmptyString(item, `${path}.missingCapabilities[${index}]`)),
    };
}
function parseSwitchEvents(input, path) {
    if (!Array.isArray(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an array`);
    return input.map((item, index) => parseSwitchEvent(item, `${path}[${index}]`));
}
function parseSwitchEvent(input, path) {
    if (!isRecord(input))
        throw new Error(`Invalid goal model resolution: ${path} must be an object`);
    assertKnownKeys(input, [
        "fromCandidateIndex",
        "fromModel",
        "toCandidateIndex",
        "toModel",
        "reason",
    ], path);
    const fromCandidateIndex = requireNonNegativeInteger(input.fromCandidateIndex, `${path}.fromCandidateIndex`);
    const fromModel = requireNonEmptyString(input.fromModel, `${path}.fromModel`);
    const toCandidateIndex = requireNonNegativeInteger(input.toCandidateIndex, `${path}.toCandidateIndex`);
    const toModel = requireNonEmptyString(input.toModel, `${path}.toModel`);
    const reason = requireNonEmptyString(input.reason, `${path}.reason`);
    return { fromCandidateIndex, fromModel, toCandidateIndex, toModel, reason };
}
function parseStatus(input, path) {
    if (input !== "resolved" && input !== "blocked" && input !== "warn")
        throw new Error(`Invalid goal model resolution: ${path} must be resolved, blocked, or warn`);
    return input;
}
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function requireNonEmptyString(input, path) {
    if (typeof input !== "string" || !input.trim())
        throw new Error(`Invalid value at ${path}: expected non-empty string`);
    return input.trim();
}
function requireBoolean(input, path) {
    if (typeof input !== "boolean")
        throw new Error(`Invalid value at ${path}: expected boolean`);
    return input;
}
function requireNonNegativeInteger(input, path) {
    if (typeof input !== "number" || !Number.isInteger(input) || input < 0)
        throw new Error(`Invalid value at ${path}: expected non-negative integer`);
    return input;
}
function parseEnum(input, values, path) {
    if (typeof input !== "string" ||
        !values.includes(input)) {
        throw new Error(`Invalid value at ${path}: expected one of ${values.join(", ")}`);
    }
    return input;
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
//# sourceMappingURL=model-resolution.js.map