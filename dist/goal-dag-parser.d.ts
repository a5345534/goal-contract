/**
 * Pure Goal DAG file parser.
 *
 * This module validates the on-disk shape of a Goal DAG JSON file:
 * structural constraints, id patterns, dependency existence, acyclicity,
 * model-scenario referential integrity, required-evidence token support,
 * workspace binding shape, and artifact-lock sha256 format.
 *
 * It does **not** materialise runtime scheduler nodes or plan execution
 * slots.  Those operations (`planGoalDagFromFileDocument`,
 * `createGoalDagNodes`, etc.) belong in goal-runner.
 */
import type { GoalDagConflictHints, GoalDagFileDefaults, GoalDagFileDocument, GoalDagFileNode, GoalDagValidationContract, GoalValidationArtifactLock } from "./goal-dag-types.js";
export type { GoalDagConflictHints, GoalDagFileDefaults, GoalDagFileDocument, GoalDagFileNode, GoalDagValidationContract, GoalValidationArtifactLock, };
export declare function parseGoalDagFileContent(content: string): GoalDagFileDocument;
export declare function parseGoalDagFileDocument(input: unknown): GoalDagFileDocument;
