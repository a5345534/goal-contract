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
/**
 * Parse and validate a `ChoiceActionRequest` from an untrusted object.
 *
 * Throws with a descriptive message on any structural or semantic error
 * (missing required fields, duplicate ids/aliases, disabled without reason,
 * invalid enum values, etc.).
 */
export declare function parseChoiceActionRequest(input: unknown, path?: string): ChoiceActionRequest;
/**
 * Parse and validate a `ChoiceActionSelectionResult` from an untrusted object.
 *
 * This validates structural integrity only.  Use
 * `validateChoiceActionSelectionResultAgainstRequest` to verify the result
 * against its source request.
 */
export declare function parseChoiceActionSelectionResult(input: unknown, path?: string): ChoiceActionSelectionResult;
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
export declare function validateChoiceActionSelectionResultAgainstRequest(result: ChoiceActionSelectionResult, request: ChoiceActionRequest, path?: string): void;
/**
 * Convenience: parse a result and validate it against a request in one pass.
 */
export declare function parseAndValidateChoiceActionSelectionResult(input: unknown, request: ChoiceActionRequest, path?: string): ChoiceActionSelectionResult;
