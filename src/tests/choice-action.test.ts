import test from "node:test";
import assert from "node:assert/strict";
import {
  parseChoiceActionRequest,
  parseChoiceActionSelectionResult,
  validateChoiceActionSelectionResultAgainstRequest,
  parseAndValidateChoiceActionSelectionResult,
  type ChoiceActionRequest,
} from "../choice-action.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validRequest(): ChoiceActionRequest {
  return parseChoiceActionRequest({
    requestId: "req-1",
    title: "Confirm scope",
    body: "Are you satisfied with the problem scope?",
    choices: [
      {
        id: "confirm",
        label: "Confirm scope",
        canonicalValue: "confirm_scope_for_analysis",
        aliases: ["1", "c", "confirm", "yes", "y"],
        description: "Proceed to analysis",
      },
      {
        id: "revise",
        label: "Revise scope",
        canonicalValue: "revise_scope",
        aliases: ["2", "r", "revise"],
      },
      {
        id: "abandon",
        label: "Abandon proposal",
        canonicalValue: "abandon_proposal",
        aliases: ["3", "a", "abandon", "no", "n"],
        disabled: true,
        disabledReason: "Abandon is not available during ideation.",
      },
    ],
    fallbackPrompt: "Choose [1] Confirm, [2] Revise, or [3] Abandon:",
    allowTextAliases: true,
  });
}

// ---------------------------------------------------------------------------
// parseChoiceActionRequest — valid inputs
// ---------------------------------------------------------------------------

test("accepts valid request", () => {
  const req = validRequest();
  assert.equal(req.requestId, "req-1");
  assert.equal(req.title, "Confirm scope");
  assert.equal(req.choices.length, 3);
  assert.equal(req.choices[0].canonicalValue, "confirm_scope_for_analysis");
  assert.equal(req.allowTextAliases, true);
});

test("accepts request with allowDisabledOverride", () => {
  const raw = {
    requestId: "req-d",
    title: "Override test",
    choices: [
      {
        id: "only",
        label: "Only",
        canonicalValue: "only",
        aliases: ["1", "o"],
        disabled: true,
        disabledReason: "test restriction",
      },
    ],
    fallbackPrompt: "Choose:",
    allowTextAliases: true,
    allowDisabledOverride: true,
  };
  const req = parseChoiceActionRequest(raw);
  assert.equal(req.allowDisabledOverride, true);
});

test("accepts request without body", () => {
  const req = parseChoiceActionRequest({
    requestId: "r",
    title: "T",
    choices: [{ id: "c1", label: "L", canonicalValue: "cv", aliases: ["1"] }],
    fallbackPrompt: "Pick:",
    allowTextAliases: false,
  });
  assert.equal(req.body, undefined);
});

test("accepts request without metadata", () => {
  const req = validRequest();
  assert.equal(req.metadata, undefined);
});

test("accepts request with metadata", () => {
  const req = parseChoiceActionRequest({
    ...validRequest(),
    metadata: { source: "goal-spec", gate: "stage-1.7" },
  });
  assert.deepEqual(req.metadata, { source: "goal-spec", gate: "stage-1.7" });
});

// ---------------------------------------------------------------------------
// parseChoiceActionRequest — rejection cases
// ---------------------------------------------------------------------------

test("rejects non-object input", () => {
  assert.throws(() => parseChoiceActionRequest(null), /must be an object/);
  assert.throws(() => parseChoiceActionRequest([]), /must be an object/);
  assert.throws(() => parseChoiceActionRequest("string"), /must be an object/);
});

test("rejects missing required fields", () => {
  assert.throws(() => parseChoiceActionRequest({}), /requestId/);
  assert.throws(
    () => parseChoiceActionRequest({ requestId: "r" }),
    /title/,
  );
  assert.throws(
    () => parseChoiceActionRequest({ requestId: "r", title: "T" }),
    /choices/,
  );
  assert.throws(
    () => parseChoiceActionRequest({ requestId: "r", title: "T", choices: [{ id: "c", label: "L", canonicalValue: "v", aliases: ["1"] }] }),
    /fallbackPrompt/,
  );
  assert.throws(
    () => parseChoiceActionRequest({ requestId: "r", title: "T", choices: [{ id: "c", label: "L", canonicalValue: "v", aliases: ["1"] }], fallbackPrompt: "p" }),
    /allowTextAliases/,
  );
});

test("rejects empty choices array", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /must not be empty/,
  );
});

test("rejects duplicate choice ids", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "dup", label: "A", canonicalValue: "a", aliases: ["1"] },
          { id: "dup", label: "B", canonicalValue: "b", aliases: ["2"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /duplicate choice id/,
  );
});

test("rejects duplicate normalized aliases across choices", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "a", label: "A", canonicalValue: "a", aliases: ["1"] },
          { id: "b", label: "B", canonicalValue: "b", aliases: ["1"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /duplicate normalized alias/,
  );
});

test("rejects case-insensitive duplicate aliases across choices", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "a", label: "A", canonicalValue: "a", aliases: ["CONFIRM"] },
          { id: "b", label: "B", canonicalValue: "b", aliases: ["confirm"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /duplicate normalized alias/,
  );
});

test("rejects whitespace-insensitive duplicate aliases across choices", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "a", label: "A", canonicalValue: "a", aliases: [" 1 "] },
          { id: "b", label: "B", canonicalValue: "b", aliases: ["1"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /duplicate normalized alias/,
  );
});

test("rejects duplicate normalized aliases within same choice", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "a", label: "A", canonicalValue: "a", aliases: ["1", "1"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /duplicate normalized alias/,
  );
});

test("rejects disabled choice without disabledReason", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          {
            id: "a",
            label: "A",
            canonicalValue: "a",
            aliases: ["1"],
            disabled: true,
          },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /disabled.*no disabledReason/,
  );
});

test("accepts disabled choice with disabledReason", () => {
  const req = parseChoiceActionRequest({
    requestId: "r",
    title: "T",
    choices: [
      {
        id: "a",
        label: "A",
        canonicalValue: "a",
        aliases: ["1"],
        disabled: true,
        disabledReason: "Unavailable in this phase.",
      },
    ],
    fallbackPrompt: "p",
    allowTextAliases: true,
  });
  assert.equal(req.choices[0].disabled, true);
  assert.equal(req.choices[0].disabledReason, "Unavailable in this phase.");
});

test("rejects defaultChoiceId not matching any choice", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "a", label: "A", canonicalValue: "a", aliases: ["1"] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
        defaultChoiceId: "nonexistent",
      }),
    /does not match any choice id/,
  );
});

test("accepts valid defaultChoiceId", () => {
  const req = parseChoiceActionRequest({
    requestId: "r",
    title: "T",
    choices: [
      { id: "a", label: "A", canonicalValue: "a", aliases: ["1"] },
    ],
    fallbackPrompt: "p",
    allowTextAliases: true,
    defaultChoiceId: "a",
  });
  assert.equal(req.defaultChoiceId, "a");
});

test("rejects missing aliases in choice", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [{ id: "c", label: "L", canonicalValue: "cv" }],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /aliases/,
  );
});

test("rejects empty aliases array in choice", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          { id: "c", label: "L", canonicalValue: "cv", aliases: [] },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /must not be empty/,
  );
});

test("rejects invalid inputMode in result", () => {
  assert.throws(
    () =>
      parseChoiceActionSelectionResult({
        requestId: "r",
        choiceId: "c",
        canonicalValue: "cv",
        inputMode: "voice",
        renderMode: "interactive",
        selectedAt: "2025-01-01T00:00:00Z",
      }),
    /inputMode/,
  );
});

test("rejects invalid renderMode in result", () => {
  assert.throws(
    () =>
      parseChoiceActionSelectionResult({
        requestId: "r",
        choiceId: "c",
        canonicalValue: "cv",
        inputMode: "text_alias",
        renderMode: "cli",
        selectedAt: "2025-01-01T00:00:00Z",
      }),
    /renderMode/,
  );
});

test("rejects extra keys in request", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        ...validRequest(),
        extraField: true,
      }),
    /not supported/,
  );
});

test("rejects extra keys in choice", () => {
  assert.throws(
    () =>
      parseChoiceActionRequest({
        requestId: "r",
        title: "T",
        choices: [
          {
            id: "c",
            label: "L",
            canonicalValue: "cv",
            aliases: ["1"],
            color: "red",
          },
        ],
        fallbackPrompt: "p",
        allowTextAliases: true,
      }),
    /not supported/,
  );
});

// ---------------------------------------------------------------------------
// parseChoiceActionSelectionResult
// ---------------------------------------------------------------------------

test("accepts valid selection result", () => {
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "confirm",
    canonicalValue: "confirm_scope_for_analysis",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.equal(result.requestId, "req-1");
  assert.equal(result.choiceId, "confirm");
  assert.equal(result.inputMode, "interactive");
  assert.equal(result.renderMode, "interactive");
});

test("accepts text alias result", () => {
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "revise",
    canonicalValue: "revise_scope",
    inputMode: "text_alias",
    renderMode: "text_fallback",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.equal(result.inputMode, "text_alias");
  assert.equal(result.renderMode, "text_fallback");
});

test("accepts defaulted result", () => {
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "confirm",
    canonicalValue: "confirm_scope_for_analysis",
    inputMode: "defaulted",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.equal(result.inputMode, "defaulted");
});

// ---------------------------------------------------------------------------
// validateChoiceActionSelectionResultAgainstRequest
// ---------------------------------------------------------------------------

test("valid result against request passes", () => {
  const request = validRequest();
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "confirm",
    canonicalValue: "confirm_scope_for_analysis",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  // should not throw
  validateChoiceActionSelectionResultAgainstRequest(result, request);
});

test("rejects mismatched requestId", () => {
  const request = validRequest();
  const result = parseChoiceActionSelectionResult({
    requestId: "wrong-id",
    choiceId: "confirm",
    canonicalValue: "confirm_scope_for_analysis",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.throws(
    () => validateChoiceActionSelectionResultAgainstRequest(result, request),
    /does not match request id/,
  );
});

test("rejects unknown choiceId", () => {
  const request = validRequest();
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "unknown",
    canonicalValue: "confirm_scope_for_analysis",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.throws(
    () => validateChoiceActionSelectionResultAgainstRequest(result, request),
    /not found in source request/,
  );
});

test("rejects mismatched canonicalValue", () => {
  const request = validRequest();
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "revise",
    canonicalValue: "wrong_value",
    inputMode: "text_alias",
    renderMode: "text_fallback",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.throws(
    () => validateChoiceActionSelectionResultAgainstRequest(result, request),
    /does not match choice.*canonical value/,
  );
});

test("rejects disabled choice without allowDisabledOverride", () => {
  const request = validRequest(); // abandon is disabled, allowDisabledOverride not set
  const result = parseChoiceActionSelectionResult({
    requestId: "req-1",
    choiceId: "abandon",
    canonicalValue: "abandon_proposal",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  assert.throws(
    () => validateChoiceActionSelectionResultAgainstRequest(result, request),
    /disabled.*allowDisabledOverride/,
  );
});

test("accepts disabled choice when allowDisabledOverride is set", () => {
  const request = parseChoiceActionRequest({
    requestId: "req-do",
    title: "Override",
    choices: [
      {
        id: "abandon",
        label: "Abandon",
        canonicalValue: "abandon_proposal",
        aliases: ["1"],
        disabled: true,
        disabledReason: "Not available.",
      },
    ],
    fallbackPrompt: "Pick:",
    allowTextAliases: true,
    allowDisabledOverride: true,
  });
  const result = parseChoiceActionSelectionResult({
    requestId: "req-do",
    choiceId: "abandon",
    canonicalValue: "abandon_proposal",
    inputMode: "interactive",
    renderMode: "interactive",
    selectedAt: "2025-06-01T12:00:00Z",
  });
  // should not throw
  validateChoiceActionSelectionResultAgainstRequest(result, request);
});

// ---------------------------------------------------------------------------
// parseAndValidateChoiceActionSelectionResult
// ---------------------------------------------------------------------------

test("parseAndValidate passes for valid result", () => {
  const request = validRequest();
  const result = parseAndValidateChoiceActionSelectionResult(
    {
      requestId: "req-1",
      choiceId: "confirm",
      canonicalValue: "confirm_scope_for_analysis",
      inputMode: "interactive",
      renderMode: "interactive",
      selectedAt: "2025-06-01T12:00:00Z",
    },
    request,
  );
  assert.equal(result.canonicalValue, "confirm_scope_for_analysis");
});

test("parseAndValidate throws for invalid result", () => {
  const request = validRequest();
  assert.throws(
    () =>
      parseAndValidateChoiceActionSelectionResult(
        {
          requestId: "wrong",
          choiceId: "confirm",
          canonicalValue: "confirm_scope_for_analysis",
          inputMode: "interactive",
          renderMode: "interactive",
          selectedAt: "2025-06-01T12:00:00Z",
        },
        request,
      ),
    /does not match request id/,
  );
});

// ---------------------------------------------------------------------------
// Scenario coverage from spec
// ---------------------------------------------------------------------------

test("Scenario: interactive and text selections produce equivalent canonical values", () => {
  const request = parseChoiceActionRequest({
    requestId: "gate-1",
    title: "Gate decision",
    choices: [
      {
        id: "confirm",
        label: "Confirm",
        canonicalValue: "confirm_scope_for_analysis",
        aliases: ["1", "c", "confirm"],
      },
      {
        id: "revise",
        label: "Revise",
        canonicalValue: "revise_scope",
        aliases: ["2", "r", "revise"],
      },
    ],
    fallbackPrompt: "[1] Confirm [2] Revise:",
    allowTextAliases: true,
  });

  // Interactive selection
  const interactiveResult = parseAndValidateChoiceActionSelectionResult(
    {
      requestId: "gate-1",
      choiceId: "confirm",
      canonicalValue: "confirm_scope_for_analysis",
      inputMode: "interactive",
      renderMode: "interactive",
      selectedAt: "2025-06-01T12:00:00Z",
    },
    request,
  );

  // Text alias selection
  const textResult = parseAndValidateChoiceActionSelectionResult(
    {
      requestId: "gate-1",
      choiceId: "confirm",
      canonicalValue: "confirm_scope_for_analysis",
      inputMode: "text_alias",
      renderMode: "text_fallback",
      selectedAt: "2025-06-01T12:01:00Z",
    },
    request,
  );

  assert.equal(interactiveResult.choiceId, textResult.choiceId);
  assert.equal(interactiveResult.canonicalValue, textResult.canonicalValue);
  assert.equal(interactiveResult.canonicalValue, "confirm_scope_for_analysis");
  assert.notEqual(interactiveResult.inputMode, textResult.inputMode);
  assert.notEqual(interactiveResult.renderMode, textResult.renderMode);
});
