import { type GoalModelClass, type GoalModelMinimumRequirements } from "./model-class.js";
export type GoalModelBindingCatalogVersion = 1 | 2;
export interface GoalModelBindingCandidate {
    model: string;
    declaredCapabilities: GoalModelMinimumRequirements;
    notes?: string;
}
export interface GoalModelSingleBinding extends GoalModelBindingCandidate {
}
export interface GoalModelBindingRetryPolicy {
    attemptsPerCandidate: number;
}
export interface GoalModelCandidateChainBinding {
    candidates: GoalModelBindingCandidate[];
    retryPolicy?: GoalModelBindingRetryPolicy;
    notes?: string;
}
export type GoalModelBinding = GoalModelSingleBinding | GoalModelCandidateChainBinding;
export interface GoalModelNormalizedBinding {
    candidates: GoalModelBindingCandidate[];
    retryPolicy?: GoalModelBindingRetryPolicy;
    notes?: string;
}
export interface GoalModelNormalizedBindingCatalog {
    version: GoalModelBindingCatalogVersion;
    harness: string;
    bindings: Record<string, GoalModelNormalizedBinding>;
}
export interface GoalModelBindingCatalog {
    version: GoalModelBindingCatalogVersion;
    harness: string;
    bindings: Record<string, GoalModelBinding>;
}
export interface GoalModelBindingCompliance {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
    status: "resolved" | "blocked" | "warn";
}
export interface GoalModelBindingCandidateCompliance extends GoalModelBindingCompliance {
    candidateIndex: number;
    model: string;
}
export declare function parseGoalModelBindingCatalogJson(json: string, path?: string): GoalModelBindingCatalog;
export declare function parseGoalModelBindingCatalog(input: unknown, path?: string): GoalModelBindingCatalog;
export declare function parseNormalizedGoalModelBindingCatalog(input: unknown, path?: string): GoalModelNormalizedBindingCatalog;
export declare function parseGoalModelBinding(input: unknown, path: string, version?: GoalModelBindingCatalogVersion): GoalModelBinding;
export declare function normalizeGoalModelBinding(binding: GoalModelBinding, path?: string): GoalModelNormalizedBinding;
export declare function normalizeGoalModelBindingCatalog(catalog: GoalModelBindingCatalog, path?: string): GoalModelNormalizedBindingCatalog;
export declare function getGoalModelBindingCandidates(binding: GoalModelBinding, path?: string): GoalModelBindingCandidate[];
export declare function evaluateGoalModelBindingCompliance(modelClass: GoalModelClass, binding: GoalModelBindingCandidate): GoalModelBindingCompliance;
export declare function evaluateGoalModelBindingCandidateCompliance(modelClass: GoalModelClass, candidate: GoalModelBindingCandidate): GoalModelBindingCompliance;
export declare function evaluateGoalModelBindingCandidateChainCompliance(modelClass: GoalModelClass, binding: GoalModelBinding): GoalModelBindingCandidateCompliance[];
export declare function missingMinimumCapabilities(minimum: GoalModelMinimumRequirements, declared: GoalModelMinimumRequirements): string[];
