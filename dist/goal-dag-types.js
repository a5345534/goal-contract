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
// ---------------------------------------------------------------------------
// Quality profiles
// ---------------------------------------------------------------------------
/**
 * Closed vocabulary of quality profiles that control how downstream runtimes
 * prompt, validate, and complete DAG nodes.
 *
 * New profiles require a subsequent governed contract change.
 */
export const ALL_GOAL_QUALITY_PROFILES = [
    "incremental-implementation",
    "test-driven-change",
    "code-review-required",
    "independent-audit",
    "security-sensitive-review",
    "api-contract-change",
    "database-migration",
    "docs-required",
    "observability-required",
    "ship-preflight",
    "implementation-discipline",
];
/** Compatibility alias for producer/runtime code that imports the shorter name. */
export const GOAL_QUALITY_PROFILES = ALL_GOAL_QUALITY_PROFILES;
export const ALL_GOAL_QUALITY_PROFILES_SET = new Set(ALL_GOAL_QUALITY_PROFILES);
/** Compatibility alias for producer/runtime code that imports the shorter name. */
export const GOAL_QUALITY_PROFILE_SET = ALL_GOAL_QUALITY_PROFILES_SET;
export function isGoalQualityProfile(value) {
    return ALL_GOAL_QUALITY_PROFILES_SET.has(value);
}
export function requireGoalQualityProfile(value, path) {
    if (typeof value !== "string" || !isGoalQualityProfile(value)) {
        throw new Error(`Invalid quality profile at ${path}: ${JSON.stringify(value)}. ` +
            `Supported values are: ${ALL_GOAL_QUALITY_PROFILES.join(", ")}`);
    }
    return value;
}
/** Resolve defaults + node quality profiles with stable first-seen de-duplication. */
export function resolveGoalQualityProfiles(defaults, node) {
    const seen = new Set();
    const resolved = [];
    for (const profile of [...qualityProfileList(defaults), ...qualityProfileList(node)]) {
        if (seen.has(profile))
            continue;
        seen.add(profile);
        resolved.push(profile);
    }
    return resolved;
}
function qualityProfileList(source) {
    if (!source)
        return [];
    if (Array.isArray(source))
        return source;
    return source.qualityProfiles ?? [];
}
//# sourceMappingURL=goal-dag-types.js.map