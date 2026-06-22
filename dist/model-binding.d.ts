import { type GoalModelClass, type GoalModelMinimumRequirements } from "./model-class.js";
export interface GoalModelBinding {
    model: string;
    declaredCapabilities: GoalModelMinimumRequirements;
    notes?: string;
}
export interface GoalModelBindingCatalog {
    version: 1;
    harness: string;
    bindings: Record<string, GoalModelBinding>;
}
export interface GoalModelBindingCompliance {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
    status: "resolved" | "blocked" | "warn";
}
export declare function parseGoalModelBindingCatalogJson(json: string, path?: string): GoalModelBindingCatalog;
export declare function parseGoalModelBindingCatalog(input: unknown, path?: string): GoalModelBindingCatalog;
export declare function parseGoalModelBinding(input: unknown, path: string): GoalModelBinding;
export declare function evaluateGoalModelBindingCompliance(modelClass: GoalModelClass, binding: GoalModelBinding): GoalModelBindingCompliance;
export declare function missingMinimumCapabilities(minimum: GoalModelMinimumRequirements, declared: GoalModelMinimumRequirements): string[];
