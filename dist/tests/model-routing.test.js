import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateGoalModelBindingCompliance, getGoalModelBindingCandidates, parseGoalModelBindingCatalog, parseGoalModelClassCatalog, parseGoalModelResolution, parseGoalModelRoutingConfig, parseGoalModelRoutingConfigJson, } from "../index.js";
const validConfig = {
    scenarios: {
        controller: { modelClass: "controller" },
        implementation: { modelClass: "implementation", description: "medium-risk implementation" },
    },
    controllerScenario: "controller",
    defaultSubagentScenario: "implementation",
};
test("accepts valid modelClass routing config", () => {
    const config = parseGoalModelRoutingConfig(validConfig);
    assert.equal(config.controllerScenario, "controller");
    assert.equal(config.defaultSubagentScenario, "implementation");
    assert.equal(config.scenarios.controller.modelClass, "controller");
});
test("accepts valid model routing config JSON string", () => {
    const config = parseGoalModelRoutingConfigJson(JSON.stringify(validConfig));
    assert.equal(config.controllerScenario, "controller");
});
test("bundled model class catalog parses", () => {
    const catalogUrl = new URL("../../catalogs/model-classes.json", import.meta.url);
    const catalog = parseGoalModelClassCatalog(JSON.parse(readFileSync(catalogUrl, "utf8")), "catalogs/model-classes.json");
    assert.equal(catalog.modelClasses.frontier?.fallbackPolicy.onUnavailable, "fallback-to-implementation");
});
test("rejects missing scenarios", () => {
    assert.throws(() => parseGoalModelRoutingConfig({ controllerScenario: "x" }), /scenarios/);
});
test("rejects empty scenarios", () => {
    assert.throws(() => parseGoalModelRoutingConfig({ scenarios: {} }), /scenarios/);
});
test("rejects legacy concrete model scenario", () => {
    assert.throws(() => parseGoalModelRoutingConfig({
        scenarios: { c: { model: "openai-codex/gpt-5.5" } },
    }), /model is unsupported; use modelClass/);
});
test("rejects scenario without modelClass", () => {
    assert.throws(() => parseGoalModelRoutingConfig({ scenarios: { c: { description: "missing class" } } }), /modelClass/);
});
test("rejects controllerScenario referencing missing scenario", () => {
    assert.throws(() => parseGoalModelRoutingConfig({
        scenarios: { c: { modelClass: "controller" } },
        controllerScenario: "missing",
    }), /unknown scenario/);
});
test("rejects rule scenario referencing missing scenario", () => {
    assert.throws(() => parseGoalModelRoutingConfig({
        scenarios: { c: { modelClass: "controller" } },
        rules: [{ scenario: "missing" }],
    }), /unknown scenario/);
});
test("accepts valid rule with match", () => {
    const config = parseGoalModelRoutingConfig({
        ...validConfig,
        rules: [{ scenario: "implementation", when: { risks: ["low"] } }],
    });
    assert.equal(config.rules?.length, 1);
    assert.deepEqual(config.rules[0].when?.risks, ["low"]);
});
test("rejects invalid risk in rule match", () => {
    assert.throws(() => parseGoalModelRoutingConfig({
        ...validConfig,
        rules: [{ scenario: "implementation", when: { risks: ["extreme"] } }],
    }), /risks/);
});
test("rejects extra root keys in config", () => {
    assert.throws(() => parseGoalModelRoutingConfig({ ...validConfig, extraField: true }), /unsupported field/);
});
test("rejects extra keys in scenario definition", () => {
    assert.throws(() => parseGoalModelRoutingConfig({
        scenarios: { c: { modelClass: "controller", extra: 1 } },
    }), /unsupported field/);
});
test("binding catalog parses", () => {
    const catalog = parseGoalModelBindingCatalog({
        version: 1,
        harness: "pi",
        bindings: {
            controller: {
                model: "openai-codex/gpt-5.5",
                declaredCapabilities: { reasoning: "very_high", contextWindowTokens: 256000, toolUse: "required" },
            },
        },
    });
    assert.equal(getGoalModelBindingCandidates(catalog.bindings.controller)[0]?.model, "openai-codex/gpt-5.5");
});
test("resolution report parses", () => {
    const report = parseGoalModelResolution({
        schemaVersion: "1.0",
        harness: "pi",
        requested: {
            modelScenario: "controller",
            modelClass: "controller",
            minimumRequirements: { reasoning: "high" },
        },
        resolved: { model: "openai-codex/gpt-5.5", bindingSource: "catalogs/bindings/pi.json" },
        compliance: { satisfiesMinimum: true, downgraded: false, missingCapabilities: [] },
        status: "resolved",
    });
    assert.equal(report.status, "resolved");
});
test("binding compliance passes when capabilities satisfy requirements", () => {
    const classes = parseGoalModelClassCatalog({
        version: 1,
        modelClasses: {
            controller: {
                minimumRequirements: { reasoning: "high", toolUse: "required" },
                fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
            },
        },
    });
    const binding = getGoalModelBindingCandidates(parseGoalModelBindingCatalog({
        version: 1,
        harness: "pi",
        bindings: {
            controller: {
                model: "openai-codex/gpt-5.5",
                declaredCapabilities: { reasoning: "very_high", toolUse: "required" },
            },
        },
    }).bindings.controller)[0];
    const compliance = evaluateGoalModelBindingCompliance(classes.modelClasses.controller, binding);
    assert.equal(compliance.status, "resolved");
    assert.equal(compliance.satisfiesMinimum, true);
});
test("binding compliance blocks when required very_high reasoning is missing", () => {
    const classes = parseGoalModelClassCatalog({
        version: 1,
        modelClasses: {
            "value-judge": {
                minimumRequirements: { reasoning: "very_high" },
                fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
            },
        },
    });
    const binding = getGoalModelBindingCandidates(parseGoalModelBindingCatalog({
        version: 1,
        harness: "pi",
        bindings: {
            "value-judge": {
                model: "deepseek/deepseek-v4-pro",
                declaredCapabilities: { reasoning: "high" },
            },
        },
    }).bindings["value-judge"])[0];
    const compliance = evaluateGoalModelBindingCompliance(classes.modelClasses["value-judge"], binding);
    assert.equal(compliance.status, "blocked");
    assert.deepEqual(compliance.missingCapabilities, ["reasoning"]);
});
test("downgrade is only allowed when fallbackPolicy.allowDowngrade=true", () => {
    const blockedClass = parseGoalModelClassCatalog({
        version: 1,
        modelClasses: {
            strict: {
                minimumRequirements: { reasoning: "very_high" },
                fallbackPolicy: { allowDowngrade: false, onUnavailable: "block" },
            },
        },
    }).modelClasses.strict;
    const warnClass = parseGoalModelClassCatalog({
        version: 1,
        modelClasses: {
            lenient: {
                minimumRequirements: { reasoning: "very_high" },
                fallbackPolicy: { allowDowngrade: true, onUnavailable: "warn" },
            },
        },
    }).modelClasses.lenient;
    const fallbackClass = parseGoalModelClassCatalog({
        version: 1,
        modelClasses: {
            fallback: {
                minimumRequirements: { reasoning: "very_high" },
                fallbackPolicy: { allowDowngrade: true, onUnavailable: "fallback-to-implementation" },
            },
        },
    }).modelClasses.fallback;
    const binding = getGoalModelBindingCandidates(parseGoalModelBindingCatalog({
        version: 1,
        harness: "pi",
        bindings: {
            candidate: { model: "some/model", declaredCapabilities: { reasoning: "high" } },
        },
    }).bindings.candidate)[0];
    assert.equal(evaluateGoalModelBindingCompliance(blockedClass, binding).status, "blocked");
    assert.equal(evaluateGoalModelBindingCompliance(warnClass, binding).status, "warn");
    assert.equal(evaluateGoalModelBindingCompliance(fallbackClass, binding).status, "warn");
});
//# sourceMappingURL=model-routing.test.js.map