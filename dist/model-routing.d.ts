/**
 * Goal model-routing contract.
 *
 * Defines the canonical format for scenario-to-model routing tables
 * consumed by goal-dag and goal-runner.  Runtime model-resolution
 * functions such as `resolveControllerModelArg()` and
 * `selectModelScenarioForNode()` belong in goal-runner, not here.
 */
export type GoalDagRisk = "low" | "medium" | "high";
export declare const CANONICAL_MODEL_ID_PATTERN: RegExp;
export interface GoalModelScenario {
    model: string;
    description?: string;
}
export interface GoalModelRoutingRuleMatch {
    nodeIds?: string[];
    scopes?: string[];
    risks?: GoalDagRisk[];
    modules?: string[];
    capabilities?: string[];
    files?: string[];
    objectiveIncludes?: string[];
    hasValidators?: boolean;
    hasOutputs?: boolean;
}
export interface GoalModelRoutingRule {
    scenario: string;
    when?: GoalModelRoutingRuleMatch;
}
export interface GoalModelRoutingConfig {
    scenarios: Record<string, GoalModelScenario>;
    controllerScenario?: string;
    defaultSubagentScenario?: string;
    rules?: GoalModelRoutingRule[];
}
export declare function isCanonicalModelId(value: string): boolean;
export declare function requireCanonicalModelId(input: unknown, path: string): string;
/**
 * Parse and validate a goal model-routing configuration object.
 *
 * This is the pure contract parser: it checks structure, scenario ids,
 * canonical model id format, and referential integrity of scenario
 * references.  It does *not* resolve controller or per-node model
 * selections — that is runtime behaviour owned by goal-runner.
 */
export declare function parseGoalModelRoutingConfig(input: unknown, path?: string): GoalModelRoutingConfig;
export declare function parseGoalModelRoutingConfigJson(json: string, path?: string): GoalModelRoutingConfig;
