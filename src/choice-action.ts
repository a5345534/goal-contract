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
// Types
// ---------------------------------------------------------------------------

export interface ChoiceActionChoice {
  /** Stable choice id unique within the request. */
  id: string;
  /** Visible label, localizable by the producer or presentation layer. */
  label: string;
  /** Machine-readable value persisted by the consumer. */
  canonicalValue: string;
  /** Numeric and short text aliases accepted as input. */
  aliases: string[];
  /** Optional supporting text shown with the choice. */
  description?: string;
  /** Whether the choice is currently unavailable. */
  disabled?: boolean;
  /** Required when disabled is true. */
  disabledReason?: string;
}

export interface ChoiceActionRequest {
  /** Stable id for the decision prompt instance. */
  requestId: string;
  /** Short user-facing title for the decision. */
  title: string;
  /** Optional explanatory text shown with the choices. */
  body?: string;
  /** Ordered set of selectable choices (non-empty). */
  choices: ChoiceActionChoice[];
  /** Text prompt representation for non-interactive surfaces. */
  fallbackPrompt: string;
  /** Optional default choice id for timeout or explicit default behaviour. */
  defaultChoiceId?: string;
  /** Whether numeric and short text aliases may be accepted as input. */
  allowTextAliases: boolean;
  /** Whether a disabled choice may be selected despite its disabled state. */
  allowDisabledOverride?: boolean;
  /** Optional non-authoritative context for consumers. */
  metadata?: Record<string, unknown>;
}

export type ChoiceActionInputMode = "interactive" | "text_alias" | "canonical_text" | "defaulted";

export type ChoiceActionRenderMode = "interactive" | "text_fallback" | "unsupported";

export interface ChoiceActionSelectionResult {
  /** Matches the request id of the original choice/action request. */
  requestId: string;
  /** The id of the selected choice. */
  choiceId: string;
  /** The canonical value of the selected choice, preserved from the request. */
  canonicalValue: string;
  /** How the user input was captured. */
  inputMode: ChoiceActionInputMode;
  /** How the harness presented the choices. */
  renderMode: ChoiceActionRenderMode;
  /** ISO-8601 timestamp of the selection. */
  selectedAt: string;
}

// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------

const INPUT_MODE_VALUES: readonly ChoiceActionInputMode[] = [
  "interactive",
  "text_alias",
  "canonical_text",
  "defaulted",
] as const;

const RENDER_MODE_VALUES: readonly ChoiceActionRenderMode[] = [
  "interactive",
  "text_fallback",
  "unsupported",
] as const;

/**
 * Parse and validate a `ChoiceActionRequest` from an untrusted object.
 *
 * Throws with a descriptive message on any structural or semantic error
 * (missing required fields, duplicate ids/aliases, disabled without reason,
 * invalid enum values, etc.).
 */
export function parseChoiceActionRequest(
  input: unknown,
  path = "choiceActionRequest",
): ChoiceActionRequest {
  if (!isRecord(input)) {
    throw new Error(`Invalid choice action request: ${path} must be an object`);
  }

  assertKnownKeys(
    input,
    [
      "requestId",
      "title",
      "body",
      "choices",
      "fallbackPrompt",
      "defaultChoiceId",
      "allowTextAliases",
      "allowDisabledOverride",
      "metadata",
    ],
    path,
  );

  const requestId = requireNonEmptyString(input.requestId, `${path}.requestId`);
  const title = requireNonEmptyString(input.title, `${path}.title`);
  const body =
    input.body === undefined
      ? undefined
      : requireNonEmptyString(input.body, `${path}.body`);
  const choices = parseChoices(input.choices, `${path}.choices`);
  const fallbackPrompt = requireNonEmptyString(
    input.fallbackPrompt,
    `${path}.fallbackPrompt`,
  );
  const defaultChoiceId =
    input.defaultChoiceId === undefined
      ? undefined
      : requireNonEmptyString(input.defaultChoiceId, `${path}.defaultChoiceId`);
  const allowTextAliases = requireBoolean(
    input.allowTextAliases,
    `${path}.allowTextAliases`,
  );
  const allowDisabledOverride =
    input.allowDisabledOverride === undefined
      ? false
      : requireBoolean(
          input.allowDisabledOverride,
          `${path}.allowDisabledOverride`,
        );
  const metadata =
    input.metadata === undefined
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
      throw new Error(
        `Invalid choice action request: ${path}.defaultChoiceId ${JSON.stringify(defaultChoiceId)} does not match any choice id`,
      );
    }
  }

  const result: ChoiceActionRequest = {
    requestId,
    title,
    choices,
    fallbackPrompt,
    allowTextAliases,
    allowDisabledOverride,
  };
  if (body !== undefined) result.body = body;
  if (defaultChoiceId !== undefined) result.defaultChoiceId = defaultChoiceId;
  if (metadata !== undefined) result.metadata = metadata;
  return result;
}

/**
 * Parse and validate a `ChoiceActionSelectionResult` from an untrusted object.
 *
 * This validates structural integrity only.  Use
 * `validateChoiceActionSelectionResultAgainstRequest` to verify the result
 * against its source request.
 */
export function parseChoiceActionSelectionResult(
  input: unknown,
  path = "choiceActionSelectionResult",
): ChoiceActionSelectionResult {
  if (!isRecord(input)) {
    throw new Error(
      `Invalid choice action selection result: ${path} must be an object`,
    );
  }

  assertKnownKeys(
    input,
    ["requestId", "choiceId", "canonicalValue", "inputMode", "renderMode", "selectedAt"],
    path,
  );

  const requestId = requireNonEmptyString(input.requestId, `${path}.requestId`);
  const choiceId = requireNonEmptyString(input.choiceId, `${path}.choiceId`);
  const canonicalValue = requireNonEmptyString(
    input.canonicalValue,
    `${path}.canonicalValue`,
  );
  const inputMode = parseEnum(
    input.inputMode,
    INPUT_MODE_VALUES,
    `${path}.inputMode`,
  );
  const renderMode = parseEnum(
    input.renderMode,
    RENDER_MODE_VALUES,
    `${path}.renderMode`,
  );
  const selectedAt = requireNonEmptyString(
    input.selectedAt,
    `${path}.selectedAt`,
  );

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
export function validateChoiceActionSelectionResultAgainstRequest(
  result: ChoiceActionSelectionResult,
  request: ChoiceActionRequest,
  path = "choiceActionSelectionResult",
): void {
  if (result.requestId !== request.requestId) {
    throw new Error(
      `Invalid choice action selection result: ${path}.requestId ${JSON.stringify(result.requestId)} does not match request id ${JSON.stringify(request.requestId)}`,
    );
  }

  const choice = request.choices.find((c) => c.id === result.choiceId);
  if (!choice) {
    throw new Error(
      `Invalid choice action selection result: ${path}.choiceId ${JSON.stringify(result.choiceId)} not found in source request`,
    );
  }

  if (result.canonicalValue !== choice.canonicalValue) {
    throw new Error(
      `Invalid choice action selection result: ${path}.canonicalValue ${JSON.stringify(result.canonicalValue)} does not match choice ${JSON.stringify(choice.id)} canonical value ${JSON.stringify(choice.canonicalValue)}`,
    );
  }

  if (choice.disabled && !request.allowDisabledOverride) {
    throw new Error(
      `Invalid choice action selection result: ${path}.choiceId ${JSON.stringify(result.choiceId)} is disabled and allowDisabledOverride is not set`,
    );
  }
}

/**
 * Convenience: parse a result and validate it against a request in one pass.
 */
export function parseAndValidateChoiceActionSelectionResult(
  input: unknown,
  request: ChoiceActionRequest,
  path = "choiceActionSelectionResult",
): ChoiceActionSelectionResult {
  const result = parseChoiceActionSelectionResult(input, path);
  validateChoiceActionSelectionResultAgainstRequest(result, request, path);
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseChoices(
  input: unknown,
  path: string,
): ChoiceActionChoice[] {
  if (!Array.isArray(input)) {
    throw new Error(
      `Invalid choice action request: ${path} must be an array`,
    );
  }
  if (input.length === 0) {
    throw new Error(
      `Invalid choice action request: ${path} must not be empty`,
    );
  }
  return input.map((item, index) => parseChoice(item, `${path}[${index}]`));
}

function parseChoice(
  input: unknown,
  path: string,
): ChoiceActionChoice {
  if (!isRecord(input)) {
    throw new Error(
      `Invalid choice action request: ${path} must be an object`,
    );
  }

  assertKnownKeys(
    input,
    ["id", "label", "canonicalValue", "aliases", "description", "disabled", "disabledReason"],
    path,
  );

  const id = requireNonEmptyString(input.id, `${path}.id`);
  const label = requireNonEmptyString(input.label, `${path}.label`);
  const canonicalValue = requireNonEmptyString(
    input.canonicalValue,
    `${path}.canonicalValue`,
  );
  const aliases = parseAliases(input.aliases, `${path}.aliases`);
  const description =
    input.description === undefined
      ? undefined
      : requireNonEmptyString(input.description, `${path}.description`);
  const disabled =
    input.disabled === undefined ? false : requireBoolean(input.disabled, `${path}.disabled`);
  const disabledReason =
    input.disabledReason === undefined
      ? undefined
      : requireNonEmptyString(
          input.disabledReason,
          `${path}.disabledReason`,
        );

  const choice: ChoiceActionChoice = { id, label, canonicalValue, aliases };
  if (description !== undefined) choice.description = description;
  if (disabled) choice.disabled = true;
  if (disabledReason !== undefined) choice.disabledReason = disabledReason;
  return choice;
}

function parseAliases(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) {
    throw new Error(
      `Invalid choice action request: ${path} must be an array`,
    );
  }
  if (input.length === 0) {
    throw new Error(
      `Invalid choice action request: ${path} must not be empty`,
    );
  }
  const seen = new Set<string>();
  return input.map((item, index) => {
    const alias = requireNonEmptyString(item, `${path}[${index}]`);
    const normalized = normalizeAlias(alias);
    if (seen.has(normalized)) {
      throw new Error(
        `Invalid choice action request: duplicate normalized alias ${JSON.stringify(normalized)} in ${path}`,
      );
    }
    seen.add(normalized);
    return alias;
  });
}

function validateUniqueChoiceIds(choices: ChoiceActionChoice[], requestPath: string): void {
  const seen = new Set<string>();
  for (const choice of choices) {
    if (seen.has(choice.id)) {
      throw new Error(
        `Invalid choice action request: ${requestPath} has duplicate choice id ${JSON.stringify(choice.id)}`,
      );
    }
    seen.add(choice.id);
  }
}

function validateUniqueAliases(choices: ChoiceActionChoice[], requestPath: string): void {
  const seen = new Set<string>();
  for (const choice of choices) {
    for (const alias of choice.aliases) {
      const normalized = normalizeAlias(alias);
      if (seen.has(normalized)) {
        throw new Error(
          `Invalid choice action request: duplicate normalized alias ${JSON.stringify(normalized)} across ${requestPath}`,
        );
      }
      seen.add(normalized);
    }
  }
}

function validateDisabledChoices(choices: ChoiceActionChoice[], requestPath: string): void {
  for (const choice of choices) {
    if (choice.disabled && !choice.disabledReason) {
      throw new Error(
        `Invalid choice action request: ${requestPath} choice ${JSON.stringify(choice.id)} is disabled but has no disabledReason`,
      );
    }
  }
}

/** Normalize alias for dedup: trim whitespace and lowercase. */
function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase();
}

function parseEnum<T extends string>(
  input: unknown,
  values: readonly T[],
  path: string,
): T {
  if (typeof input !== "string" || !(values as readonly string[]).includes(input)) {
    throw new Error(
      `Invalid choice action value at ${path}: expected one of ${values.join(", ")}`,
    );
  }
  return input as T;
}

function requireBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(
      `Invalid choice action value at ${path}: expected boolean`,
    );
  }
  return input;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(
      `Invalid choice action value at ${path}: expected non-empty string`,
    );
  }
  return input.trim();
}

function requireObject(input: unknown, path: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(
      `Invalid choice action value at ${path}: expected object`,
    );
  }
  return input;
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
        `Invalid choice action field at ${path}: ${JSON.stringify(key)} is not supported`,
      );
    }
  }
}
