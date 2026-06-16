import test from "node:test";
import assert from "node:assert/strict";
import {
  isCanonicalModelId,
  requireCanonicalModelId,
  parseGoalModelRoutingConfig,
  parseGoalModelRoutingConfigJson,
  CANONICAL_MODEL_ID_PATTERN,
} from "../model-routing.js";

const validConfig = {
  scenarios: {
    controller: { model: "openai-codex/gpt-5.5" },
    implementation: { model: "deepseek/deepseek-v4-pro", description: "medium-risk implementation" },
  },
  controllerScenario: "controller",
  defaultSubagentScenario: "implementation",
};

test("accepts provider/model id", () => {
  assert.ok(isCanonicalModelId("openai-codex/gpt-5.5"));
  assert.ok(isCanonicalModelId("deepseek/deepseek-v4-pro"));
  assert.ok(isCanonicalModelId("anthropic/claude-opus"));
  assert.ok(isCanonicalModelId("openai-codex/gpt-5.3-codex-spark"));
});

test("rejects provider.model id (dot)", () => {
  assert.equal(isCanonicalModelId("openai-codex.gpt-5.5"), false);
  assert.equal(isCanonicalModelId("openai.gpt-5.5"), false);
});

test("rejects unqualified id", () => {
  assert.equal(isCanonicalModelId("gpt-5.5"), false);
  assert.equal(isCanonicalModelId("model"), false);
});

test("rejects empty string", () => {
  assert.equal(isCanonicalModelId(""), false);
});

test("requireCanonicalModelId throws for dot format", () => {
  assert.throws(
    () => requireCanonicalModelId("openai.gpt-5.5", "test"),
    /canonical provider\/model/,
  );
});

test("requireCanonicalModelId returns value for valid format", () => {
  assert.equal(requireCanonicalModelId("openai-codex/gpt-5.5", "test"), "openai-codex/gpt-5.5");
});

test("accepts valid model routing config", () => {
  const config = parseGoalModelRoutingConfig(validConfig);
  assert.equal(config.controllerScenario, "controller");
  assert.equal(config.defaultSubagentScenario, "implementation");
  assert.equal(config.scenarios.controller.model, "openai-codex/gpt-5.5");
});

test("accepts valid model routing config JSON string", () => {
  const config = parseGoalModelRoutingConfigJson(JSON.stringify(validConfig));
  assert.equal(config.controllerScenario, "controller");
});

test("rejects missing scenarios", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({ controllerScenario: "x" }),
    /scenarios/,
  );
});

test("rejects empty scenarios", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({ scenarios: {} }),
    /scenarios/,
  );
});

test("rejects scenario with dot-format model id", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({
      scenarios: { c: { model: "openai.gpt-5.5" } },
    }),
    /canonical provider\/model/,
  );
});

test("rejects controllerScenario referencing missing scenario", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({
      scenarios: { c: { model: "openai-codex/gpt-5.5" } },
      controllerScenario: "missing",
    }),
    /unknown scenario/,
  );
});

test("rejects rule scenario referencing missing scenario", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({
      scenarios: { c: { model: "openai-codex/gpt-5.5" } },
      rules: [{ scenario: "missing" }],
    }),
    /unknown scenario/,
  );
});

test("accepts valid rule with match", () => {
  const config = parseGoalModelRoutingConfig({
    ...validConfig,
    rules: [{ scenario: "implementation", when: { risks: ["low"] } }],
  });
  assert.equal(config.rules?.length, 1);
  assert.deepEqual(config.rules![0].when?.risks, ["low"]);
});

test("rejects invalid risk in rule match", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({
      ...validConfig,
      rules: [{ scenario: "implementation", when: { risks: ["extreme"] } }],
    }),
    /risks/,
  );
});

test("rejects extra root keys in config", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({ ...validConfig, extraField: true }),
    /unsupported field/,
  );
});

test("rejects extra keys in scenario definition", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({
      scenarios: { c: { model: "openai-codex/gpt-5.5", extra: 1 } },
    }),
    /unsupported field/,
  );
});

test("rejects non-object scenarios value", () => {
  assert.throws(
    () => parseGoalModelRoutingConfig({ scenarios: "bad" }),
    /scenarios/,
  );
});

test("pattern accepts typical model ids", () => {
  const ids = [
    "openai-codex/gpt-5.5",
    "openai-codex/gpt-5.3-codex-spark",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4-flash",
    "anthropic/claude-opus",
    "local-aeon/aeon",
    "openai/gpt-5-mini",
  ];
  for (const id of ids) {
    assert.ok(CANONICAL_MODEL_ID_PATTERN.test(id), `expected match: ${id}`);
  }
});
