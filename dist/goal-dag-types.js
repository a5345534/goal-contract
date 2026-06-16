/**
 * Goal DAG on-disk file contract.
 *
 * These types represent the canonical shape of a Goal DAG JSON file as
 * consumed by goal-runner via `/goal --dag <path>`.  They are the
 * pipeline-wide contract; goal-dag produces them and goal-runner consumes
 * them.
 *
 * Runtime-only state (GoalDagNode, GoalSubagentRecord, etc.) that carries
 * controller-managed fields beyond the on-disk contract is **not** included
 * here and remains in goal-runner.
 */
export {};
//# sourceMappingURL=goal-dag-types.js.map