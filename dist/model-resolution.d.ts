import { type GoalModelMinimumRequirements } from "./model-class.js";
export interface GoalModelResolution {
    schemaVersion: "1.0";
    harness: string;
    requested: {
        role?: string;
        modelScenario?: string;
        modelClass: string;
        minimumRequirements: GoalModelMinimumRequirements;
    };
    resolved?: {
        model: string;
        bindingSource?: string;
    };
    compliance: {
        satisfiesMinimum: boolean;
        downgraded: boolean;
        missingCapabilities: string[];
    };
    status: "resolved" | "blocked" | "warn";
    reason?: string;
}
export declare function parseGoalModelResolutionJson(json: string, path?: string): GoalModelResolution;
export declare function parseGoalModelResolution(input: unknown, path?: string): GoalModelResolution;
