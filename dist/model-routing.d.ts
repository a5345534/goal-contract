/**
 * Goal model-routing contract.
 *
 * Shared DAG-level routing is intentionally abstract: producers choose
 * scenario ids and modelClass values, while concrete provider/model ids are
 * harness binding data resolved by goal-runner/adapters at runtime.
 */
export type GoalDagRisk = "low" | "medium" | "high";
export interface GoalModelScenario {
    modelClass: string;
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
/**
 * Parse and validate a goal model-routing configuration object.
 *
 * This parser rejects legacy concrete model routing (`scenario.model`) and
 * accepts only `scenario.modelClass`. Concrete model ids belong in harness
 * binding catalogs, not DAG runtime JSON or shared routing config.
 */
export declare function parseGoalModelRoutingConfig(input: unknown, path?: string): GoalModelRoutingConfig;
export declare function parseGoalModelRoutingConfigJson(json: string, path?: string): GoalModelRoutingConfig;
