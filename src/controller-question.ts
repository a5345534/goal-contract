/**
 * Controller-facing question envelope.
 *
 * A subagent that encounters material ambiguity while executing a node may
 * surface a structured question to the controller rather than silently
 * assuming or directly asking the user.  The controller triages each
 * question into one of three outcomes:
 *
 *   1. answer from existing context;
 *   2. approve a bounded assumption;
 *   3. block/escalate for human input.
 *
 * This module defines the portable question envelope shape that is stable
 * enough to become a typed field in DAG metadata or runtime state.  The
 * runtime may initially carry the envelope in transcript text, but
 * consumers SHOULD use these types when they materialise the envelope
 * structurally.
 *
 * Concrete provider/model ids, harness-level prompt prose, and
 * implementation-specific instructions are **not** part of this contract.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One selectable option within a controller-facing question.
 */
export interface ControllerQuestionOption {
  /** Stable option id unique within the question (e.g. "a", "b"). */
  id: string;
  /** Short summary of what this option represents. */
  summary: string;
  /** Cost/risk/benefit tradeoffs to help the controller decide. */
  tradeoffs: string;
}

/**
 * Who or what the controller needs to answer the question.
 */
export type ControllerQuestionNeededFrom =
  | "controller"
  | "human"
  | "external-state";

/**
 * Structured controller-facing question envelope.
 *
 * A subagent emits this to the controller when it encounters material
 * ambiguity that it cannot safely resolve locally.  The controller
 * evaluates the question and triages it into a context answer, a
 * bounded assumption approval, or a human-needed blocker.
 */
export interface ControllerQuestion {
  /** The question summarising what needs to be decided. */
  question: string;
  /** Why this affects correctness, compatibility, scope, or validation. */
  whyItMatters: string;
  /** Selectable options for resolving the question. One or more. */
  options: ControllerQuestionOption[];
  /** Id of the recommended default option from options[].id. */
  recommendedDefault: string;
  /** Whether the question blocks further progress until resolved. */
  blocking: boolean;
  /** Who or what the controller needs to answer. */
  neededFrom: ControllerQuestionNeededFrom;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const NEEDED_FROM_VALUES: readonly ControllerQuestionNeededFrom[] = [
  "controller",
  "human",
  "external-state",
] as const;

/**
 * Parse and validate a `ControllerQuestion` from an untrusted object.
 *
 * Throws with a descriptive message on any structural or semantic error.
 */
export function parseControllerQuestion(
  input: unknown,
  path = "controllerQuestion",
): ControllerQuestion {
  if (!isRecord(input)) {
    throw new Error(`Invalid controller question: ${path} must be an object`);
  }

  assertKnownKeys(
    input,
    ["question", "whyItMatters", "options", "recommendedDefault", "blocking", "neededFrom"],
    path,
  );

  const question = requireNonEmptyString(input.question, `${path}.question`);
  const whyItMatters = requireNonEmptyString(input.whyItMatters, `${path}.whyItMatters`);
  const options = parseControllerQuestionOptions(input.options, `${path}.options`);
  const recommendedDefault = requireNonEmptyString(
    input.recommendedDefault,
    `${path}.recommendedDefault`,
  );
  const blocking = requireBoolean(input.blocking, `${path}.blocking`);
  const neededFrom = parseNeededFrom(input.neededFrom, `${path}.neededFrom`);

  // Cross-field integrity
  const optionIds = new Set(options.map((o) => o.id));
  if (!optionIds.has(recommendedDefault)) {
    throw new Error(
      `Invalid controller question: ${path}.recommendedDefault ${JSON.stringify(recommendedDefault)} does not match any option id. ` +
        `Valid options: ${[...optionIds].join(", ")}`,
    );
  }

  return { question, whyItMatters, options, recommendedDefault, blocking, neededFrom };
}

/**
 * Type guard for `ControllerQuestion`.
 */
export function isControllerQuestion(value: unknown): value is ControllerQuestion {
  try {
    parseControllerQuestion(value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseControllerQuestionOptions(
  input: unknown,
  path: string,
): ControllerQuestionOption[] {
  if (!Array.isArray(input)) {
    throw new Error(`Invalid controller question: ${path} must be an array`);
  }
  if (input.length === 0) {
    throw new Error(`Invalid controller question: ${path} must not be empty`);
  }
  return input.map((item, index) => parseOption(item, `${path}[${index}]`));
}

function parseOption(input: unknown, path: string): ControllerQuestionOption {
  if (!isRecord(input)) {
    throw new Error(`Invalid controller question: ${path} must be an object`);
  }
  assertKnownKeys(input, ["id", "summary", "tradeoffs"], path);

  const id = requireNonEmptyString(input.id, `${path}.id`);
  const summary = requireNonEmptyString(input.summary, `${path}.summary`);
  const tradeoffs = requireNonEmptyString(input.tradeoffs, `${path}.tradeoffs`);

  return { id, summary, tradeoffs };
}

function parseNeededFrom(
  input: unknown,
  path: string,
): ControllerQuestionNeededFrom {
  if (typeof input !== "string" || !(NEEDED_FROM_VALUES as readonly string[]).includes(input)) {
    throw new Error(
      `Invalid controller question: ${path} must be one of ${NEEDED_FROM_VALUES.join(", ")}`,
    );
  }
  return input as ControllerQuestionNeededFrom;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(
      `Invalid controller question: ${path} must be a non-empty string`,
    );
  }
  return input.trim();
}

function requireBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(
      `Invalid controller question: ${path} must be a boolean`,
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
        `Invalid controller question: ${path} has unsupported field ${JSON.stringify(key)}`,
      );
    }
  }
}
