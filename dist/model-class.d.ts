export type ModelCapabilityLevel = "none" | "low" | "medium" | "high" | "very_high";
export interface GoalModelMinimumRequirements {
    reasoning?: ModelCapabilityLevel;
    contextWindowTokens?: number;
    toolUse?: "none" | "optional" | "required";
    structuredOutput?: "none" | "preferred" | "strict";
    formatFollowing?: ModelCapabilityLevel;
    sourceCitation?: "none" | "preferred" | "required";
    costSensitivity?: "low" | "medium" | "high";
    privacy?: "cloud-ok" | "local-only";
}
export interface GoalModelFallbackPolicy {
    allowDowngrade: boolean;
    onUnavailable: "block" | "warn" | "fallback-to-implementation";
}
export interface GoalModelClass {
    description?: string;
    minimumRequirements: GoalModelMinimumRequirements;
    fallbackPolicy: GoalModelFallbackPolicy;
}
export interface GoalModelClassCatalog {
    version: 1;
    modelClasses: Record<string, GoalModelClass>;
}
export declare function parseGoalModelClassCatalogJson(json: string, path?: string): GoalModelClassCatalog;
export declare function parseGoalModelClassCatalog(input: unknown, path?: string): GoalModelClassCatalog;
export declare function parseGoalModelClass(input: unknown, path: string): GoalModelClass;
export declare function parseGoalModelMinimumRequirements(input: unknown, path: string): GoalModelMinimumRequirements;
export declare function parseGoalModelFallbackPolicy(input: unknown, path: string): GoalModelFallbackPolicy;
export declare function requireKnownModelClass(catalog: GoalModelClassCatalog, modelClass: string, path?: string): GoalModelClass;
