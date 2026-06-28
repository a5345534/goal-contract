import test from "node:test";
import assert from "node:assert/strict";
import {
  parseControllerQuestion,
  isControllerQuestion,
  type ControllerQuestion,
} from "../controller-question.js";

// ---------------------------------------------------------------------------
// Valid question factory
// ---------------------------------------------------------------------------

function validQuestion(): ControllerQuestion {
  return parseControllerQuestion({
    question: "Should we use optimistic locking or pessimistic locking?",
    whyItMatters:
      "The locking strategy affects data consistency guarantees, contention handling, and transaction retry logic across the attendance write path.",
    options: [
      {
        id: "a",
        summary: "Optimistic locking with version fields",
        tradeoffs:
          "Lower contention for reads, but higher retry cost on conflict. Requires retry logic in the write path.",
      },
      {
        id: "b",
        summary: "Pessimistic locking via SELECT FOR UPDATE",
        tradeoffs:
          "Stronger write consistency, but higher contention and potential deadlock under concurrent writes.",
      },
    ],
    recommendedDefault: "a",
    blocking: true,
    neededFrom: "controller",
  });
}

// ---------------------------------------------------------------------------
// parseControllerQuestion — valid inputs
// ---------------------------------------------------------------------------

test("accepts valid controller question", () => {
  const q = validQuestion();
  assert.equal(q.question, "Should we use optimistic locking or pessimistic locking?");
  assert.equal(q.whyItMatters.length > 0, true);
  assert.equal(q.options.length, 2);
  assert.equal(q.recommendedDefault, "a");
  assert.equal(q.blocking, true);
  assert.equal(q.neededFrom, "controller");
});

test("accepts non-blocking question", () => {
  const q = parseControllerQuestion({
    question: "Which minor naming convention?",
    whyItMatters: "Affects consistency but not correctness.",
    options: [
      { id: "a", summary: "camelCase", tradeoffs: "Standard JS convention." },
      { id: "b", summary: "snake_case", tradeoffs: "Matches DB column style." },
    ],
    recommendedDefault: "a",
    blocking: false,
    neededFrom: "controller",
  });
  assert.equal(q.blocking, false);
});

test("accepts question needing human", () => {
  const q = parseControllerQuestion({
    question: "Which third-party API key?",
    whyItMatters: "Prod vs staging environment.",
    options: [
      { id: "a", summary: "Production key", tradeoffs: "Live traffic, rate limited." },
      { id: "b", summary: "Staging key", tradeoffs: "Test data only." },
    ],
    recommendedDefault: "b",
    blocking: true,
    neededFrom: "human",
  });
  assert.equal(q.neededFrom, "human");
});

test("accepts question needing external state", () => {
  const q = parseControllerQuestion({
    question: "What is the current DB schema version?",
    whyItMatters: "Migration compatibility check.",
    options: [
      { id: "a", summary: "Check migration table", tradeoffs: "Requires DB read." },
    ],
    recommendedDefault: "a",
    blocking: true,
    neededFrom: "external-state",
  });
  assert.equal(q.neededFrom, "external-state");
});

test("accepts single-option question", () => {
  const q = parseControllerQuestion({
    question: "Proceed with default approach?",
    whyItMatters: "No alternatives exist.",
    options: [
      { id: "a", summary: "Proceed", tradeoffs: "No risk identified." },
    ],
    recommendedDefault: "a",
    blocking: false,
    neededFrom: "controller",
  });
  assert.equal(q.options.length, 1);
  assert.equal(q.options[0].id, "a");
});

// ---------------------------------------------------------------------------
// parseControllerQuestion — rejection cases
// ---------------------------------------------------------------------------

test("rejects non-object input", () => {
  assert.throws(() => parseControllerQuestion(null), /must be an object/);
  assert.throws(() => parseControllerQuestion([]), /must be an object/);
  assert.throws(() => parseControllerQuestion("string"), /must be an object/);
});

test("rejects missing required fields", () => {
  assert.throws(() => parseControllerQuestion({}), /question/);
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
      }),
    /whyItMatters/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
      }),
    /options/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
      }),
    /recommendedDefault/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
      }),
    /blocking/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
      }),
    /neededFrom/,
  );
});

test("rejects empty options array", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /must not be empty/,
  );
});

test("rejects recommendedDefault not matching any option id", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [
          { id: "a", summary: "Option A", tradeoffs: "T" },
        ],
        recommendedDefault: "b",
        blocking: true,
        neededFrom: "controller",
      }),
    /does not match any option/,
  );
});

test("rejects invalid neededFrom value", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "user",
      }),
    /neededFrom.*must be one of/,
  );
});

test("rejects non-boolean blocking", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: "yes",
        neededFrom: "controller",
      }),
    /blocking.*must be a boolean/,
  );
});

test("rejects empty strings", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /non-empty/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /non-empty/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /non-empty/,
  );
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /non-empty/,
  );
});

test("rejects unknown keys", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
        extraField: "bad",
      }),
    /unsupported field/,
  );
});

test("rejects unknown keys in option", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: [{ id: "a", summary: "S", tradeoffs: "T", color: "red" }],
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /unsupported field/,
  );
});

test("rejects non-array options", () => {
  assert.throws(
    () =>
      parseControllerQuestion({
        question: "Q",
        whyItMatters: "W",
        options: "not-an-array",
        recommendedDefault: "a",
        blocking: true,
        neededFrom: "controller",
      }),
    /must be an array/,
  );
});

// ---------------------------------------------------------------------------
// isControllerQuestion type guard
// ---------------------------------------------------------------------------

test("isControllerQuestion returns true for valid question", () => {
  const raw = {
    question: "Test?",
    whyItMatters: "Because.",
    options: [{ id: "a", summary: "A", tradeoffs: "T" }],
    recommendedDefault: "a",
    blocking: false,
    neededFrom: "controller",
  };
  assert.equal(isControllerQuestion(raw), true);
});

test("isControllerQuestion returns false for invalid question", () => {
  assert.equal(isControllerQuestion(null), false);
  assert.equal(isControllerQuestion({}), false);
  assert.equal(isControllerQuestion({ question: "Q" }), false);
});

// ---------------------------------------------------------------------------
// Round-trip: JSON serialisation
// ---------------------------------------------------------------------------

test("round-trips through JSON", () => {
  const original = validQuestion();
  const json = JSON.stringify(original);
  const parsed = parseControllerQuestion(JSON.parse(json));
  assert.deepEqual(parsed, original);
});
