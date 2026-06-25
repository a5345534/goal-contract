/**
 * Harness-neutral choice/action contract types and pure validators.
 *
 * Producers construct a bounded `ChoiceActionRequest` with portable choice
 * semantics.  Consumers receive a normalized `ChoiceActionSelectionResult`
 * independent of whether the harness rendered an interactive selector,
 * button, menu, or text prompt.
 *
 * Validation guarantees:
 *  - choice ids are unique within a request
 *  - aliases are unique within a request after normalization
 *  - disabled choices carry a user-visible reason
 *  - selection results are only valid when the choice id exists in the
 *    source request, the canonical value matches, and a disabled choice
 *    is only accepted when the request allows it
 */
// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------
const INPUT_MODE_VALUES = [
    "interactive",
    "text_alias",
    "canonical_text",
    "defaulted",
];
const RENDER_MODE_VALUES = [
    "interactive",
    "text_fallback",
    "unsupported",
];
/**
 * Parse and validate a `ChoiceActionRequest` from an untrusted object.
 *
 * Throws with a descriptive message on any structural or semantic error
 * (missing required fields, duplicate ids/aliases, disabled without reason,
 * invalid enum values, etc.).
 */
export function parseChoiceActionRequest(input, path = "choiceActionRequest") {
    if (!isRecord(input)) {
        throw new Error(`Invalid choice action request: ${path} must be an object`);
    }
    assertKnownKeys(input, [
        "requestId",
        "title",
        "body",
        "choices",
        "fallbackPrompt",
        "defaultChoiceId",
        "allowTextAliases",
        "allowDisabledOverride",
        "metadata",
    ], path);
    const requestId = requireNonEmptyString(input.requestId, `${path}.requestId`);
    const title = requireNonEmptyString(input.title, `${path}.title`);
    const body = input.body === undefined
        ? undefined
        : requireNonEmptyString(input.body, `${path}.body`);
    const choices = parseChoices(input.choices, `${path}.choices`);
    const fallbackPrompt = requireNonEmptyString(input.fallbackPrompt, `${path}.fallbackPrompt`);
    const defaultChoiceId = input.defaultChoiceId === undefined
        ? undefined
        : requireNonEmptyString(input.defaultChoiceId, `${path}.defaultChoiceId`);
    const allowTextAliases = requireBoolean(input.allowTextAliases, `${path}.allowTextAliases`);
    const allowDisabledOverride = input.allowDisabledOverride === undefined
        ? false
        : requireBoolean(input.allowDisabledOverride, `${path}.allowDisabledOverride`);
    const metadata = input.metadata === undefined
        ? undefined
        : requireObject(input.metadata, `${path}.metadata`);
    // Cross-field integrity
    // Unique choice ids
    validateUniqueChoiceIds(choices, path);
    // Unique aliases (normalized: trimmed, lowercased)
    validateUniqueAliases(choices, path);
    // Disabled choices require a reason
    validateDisabledChoices(choices, path);
    // defaultChoiceId must reference an existing choice if provided
    if (defaultChoiceId !== undefined) {
        const idSet = new Set(choices.map((c) => c.id));
        if (!idSet.has(defaultChoiceId)) {
            throw new Error(`Invalid choice action request: ${path}.defaultChoiceId ${JSON.stringify(defaultChoiceId)} does not match any choice id`);
        }
    }
    const result = {
        requestId,
        title,
        choices,
        fallbackPrompt,
        allowTextAliases,
        allowDisabledOverride,
    };
    if (body !== undefined)
        result.body = body;
    if (defaultChoiceId !== undefined)
        result.defaultChoiceId = defaultChoiceId;
    if (metadata !== undefined)
        result.metadata = metadata;
    return result;
}
/**
 * Parse and validate a `ChoiceActionSelectionResult` from an untrusted object.
 *
 * This validates structural integrity only.  Use
 * `validateChoiceActionSelectionResultAgainstRequest` to verify the result
 * against its source request.
 */
export function parseChoiceActionSelectionResult(input, path = "choiceActionSelectionResult") {
    if (!isRecord(input)) {
        throw new Error(`Invalid choice action selection result: ${path} must be an object`);
    }
    assertKnownKeys(input, ["requestId", "choiceId", "canonicalValue", "inputMode", "renderMode", "selectedAt"], path);
    const requestId = requireNonEmptyString(input.requestId, `${path}.requestId`);
    const choiceId = requireNonEmptyString(input.choiceId, `${path}.choiceId`);
    const canonicalValue = requireNonEmptyString(input.canonicalValue, `${path}.canonicalValue`);
    const inputMode = parseEnum(input.inputMode, INPUT_MODE_VALUES, `${path}.inputMode`);
    const renderMode = parseEnum(input.renderMode, RENDER_MODE_VALUES, `${path}.renderMode`);
    const selectedAt = requireNonEmptyString(input.selectedAt, `${path}.selectedAt`);
    return {
        requestId,
        choiceId,
        canonicalValue,
        inputMode,
        renderMode,
        selectedAt,
    };
}
/**
 * Validate a `ChoiceActionSelectionResult` against its source
 * `ChoiceActionRequest`.
 *
 * Checks:
 *  - request ids match
 *  - the selected choice id exists in the request
 *  - the canonical value matches the selected choice
 *  - a disabled choice is only accepted when the request allows it
 *
 * Throws on any mismatch.
 */
export function validateChoiceActionSelectionResultAgainstRequest(result, request, path = "choiceActionSelectionResult") {
    if (result.requestId !== request.requestId) {
        throw new Error(`Invalid choice action selection result: ${path}.requestId ${JSON.stringify(result.requestId)} does not match request id ${JSON.stringify(request.requestId)}`);
    }
    const choice = request.choices.find((c) => c.id === result.choiceId);
    if (!choice) {
        throw new Error(`Invalid choice action selection result: ${path}.choiceId ${JSON.stringify(result.choiceId)} not found in source request`);
    }
    if (result.canonicalValue !== choice.canonicalValue) {
        throw new Error(`Invalid choice action selection result: ${path}.canonicalValue ${JSON.stringify(result.canonicalValue)} does not match choice ${JSON.stringify(choice.id)} canonical value ${JSON.stringify(choice.canonicalValue)}`);
    }
    if (choice.disabled && !request.allowDisabledOverride) {
        throw new Error(`Invalid choice action selection result: ${path}.choiceId ${JSON.stringify(result.choiceId)} is disabled and allowDisabledOverride is not set`);
    }
}
/**
 * Convenience: parse a result and validate it against a request in one pass.
 */
export function parseAndValidateChoiceActionSelectionResult(input, request, path = "choiceActionSelectionResult") {
    const result = parseChoiceActionSelectionResult(input, path);
    validateChoiceActionSelectionResultAgainstRequest(result, request, path);
    return result;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function parseChoices(input, path) {
    if (!Array.isArray(input)) {
        throw new Error(`Invalid choice action request: ${path} must be an array`);
    }
    if (input.length === 0) {
        throw new Error(`Invalid choice action request: ${path} must not be empty`);
    }
    return input.map((item, index) => parseChoice(item, `${path}[${index}]`));
}
function parseChoice(input, path) {
    if (!isRecord(input)) {
        throw new Error(`Invalid choice action request: ${path} must be an object`);
    }
    assertKnownKeys(input, ["id", "label", "canonicalValue", "aliases", "description", "disabled", "disabledReason"], path);
    const id = requireNonEmptyString(input.id, `${path}.id`);
    const label = requireNonEmptyString(input.label, `${path}.label`);
    const canonicalValue = requireNonEmptyString(input.canonicalValue, `${path}.canonicalValue`);
    const aliases = parseAliases(input.aliases, `${path}.aliases`);
    const description = input.description === undefined
        ? undefined
        : requireNonEmptyString(input.description, `${path}.description`);
    const disabled = input.disabled === undefined ? false : requireBoolean(input.disabled, `${path}.disabled`);
    const disabledReason = input.disabledReason === undefined
        ? undefined
        : requireNonEmptyString(input.disabledReason, `${path}.disabledReason`);
    const choice = { id, label, canonicalValue, aliases };
    if (description !== undefined)
        choice.description = description;
    if (disabled)
        choice.disabled = true;
    if (disabledReason !== undefined)
        choice.disabledReason = disabledReason;
    return choice;
}
function parseAliases(input, path) {
    if (!Array.isArray(input)) {
        throw new Error(`Invalid choice action request: ${path} must be an array`);
    }
    if (input.length === 0) {
        throw new Error(`Invalid choice action request: ${path} must not be empty`);
    }
    const seen = new Set();
    return input.map((item, index) => {
        const alias = requireNonEmptyString(item, `${path}[${index}]`);
        const normalized = normalizeAlias(alias);
        if (seen.has(normalized)) {
            throw new Error(`Invalid choice action request: duplicate normalized alias ${JSON.stringify(normalized)} in ${path}`);
        }
        seen.add(normalized);
        return alias;
    });
}
function validateUniqueChoiceIds(choices, requestPath) {
    const seen = new Set();
    for (const choice of choices) {
        if (seen.has(choice.id)) {
            throw new Error(`Invalid choice action request: ${requestPath} has duplicate choice id ${JSON.stringify(choice.id)}`);
        }
        seen.add(choice.id);
    }
}
function validateUniqueAliases(choices, requestPath) {
    const seen = new Set();
    for (const choice of choices) {
        for (const alias of choice.aliases) {
            const normalized = normalizeAlias(alias);
            if (seen.has(normalized)) {
                throw new Error(`Invalid choice action request: duplicate normalized alias ${JSON.stringify(normalized)} across ${requestPath}`);
            }
            seen.add(normalized);
        }
    }
}
function validateDisabledChoices(choices, requestPath) {
    for (const choice of choices) {
        if (choice.disabled && !choice.disabledReason) {
            throw new Error(`Invalid choice action request: ${requestPath} choice ${JSON.stringify(choice.id)} is disabled but has no disabledReason`);
        }
    }
}
/** Normalize alias for dedup: trim whitespace and lowercase. */
function normalizeAlias(alias) {
    return alias.trim().toLowerCase();
}
function parseEnum(input, values, path) {
    if (typeof input !== "string" || !values.includes(input)) {
        throw new Error(`Invalid choice action value at ${path}: expected one of ${values.join(", ")}`);
    }
    return input;
}
function requireBoolean(input, path) {
    if (typeof input !== "boolean") {
        throw new Error(`Invalid choice action value at ${path}: expected boolean`);
    }
    return input;
}
function requireNonEmptyString(input, path) {
    if (typeof input !== "string" || !input.trim()) {
        throw new Error(`Invalid choice action value at ${path}: expected non-empty string`);
    }
    return input.trim();
}
function requireObject(input, path) {
    if (!isRecord(input)) {
        throw new Error(`Invalid choice action value at ${path}: expected object`);
    }
    return input;
}
function isRecord(input) {
    return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
function assertKnownKeys(input, allowed, path) {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(input)) {
        if (!allowedSet.has(key)) {
            throw new Error(`Invalid choice action field at ${path}: ${JSON.stringify(key)} is not supported`);
        }
    }
}
//# sourceMappingURL=choice-action.js.map