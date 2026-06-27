import {
  parseGoalModelMinimumRequirements,
  type GoalModelClass,
  type GoalModelMinimumRequirements,
} from "./model-class.js";
import {
  type GoalModelBinding,
  type GoalModelBindingRetryPolicy,
  evaluateGoalModelBindingCandidateCompliance,
  getGoalModelBindingCandidates,
} from "./model-binding.js";

// ---------------------------------------------------------------------------
// Types — resolution evidence record
// ---------------------------------------------------------------------------

/**
 * Per-candidate attempt record written by the resolver as it walks the
 * fallback chain.  The resolver appends a record for each candidate it
 * selects, whether or not the attempt succeeded.
 */
export interface GoalModelResolutionAttemptedCandidate {
  /** 0-based index into the source binding's candidate array. */
  candidateIndex: number;
  /** The concrete model id for this candidate. */
  model: string;
  /** Compliance evaluation outcome for this candidate. */
  compliance: {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
  };
  /**
   * Resolution outcome for this candidate:
   *  - "succeeded" — the candidate resolved and was used.
   *  - "failed" — the candidate was attempted but did not resolve (error,
   *    timeout, unavailable).
   *  - "skipped" — the candidate was bypassed without an attempt
   *    (prerequisite failure, policy skip).
   *  - "error" — the attempt produced a non-recoverable error.
   */
  status: "succeeded" | "failed" | "skipped" | "error";
  /** Optional human-readable reason for the attempt outcome. */
  reason?: string;
}

/**
 * A chronological record of a candidate switch (fallback step) within a
 * resolution session.
 */
export interface GoalModelResolutionSwitchEvent {
  /** 0-based index of the source candidate in the fallback chain. */
  fromCandidateIndex: number;
  /** Concrete model id of the source candidate. */
  fromModel: string;
  /** 0-based index of the target candidate in the fallback chain. */
  toCandidateIndex: number;
  /** Concrete model id of the target candidate. */
  toModel: string;
  /** Machine-readable reason category for the switch. */
  reason: string;
}

/**
 * Full operator-ordered candidate plan produced from a binding catalog. Unlike
 * attemptedCandidates, this preserves candidates that were not selected during
 * initial resolution so the runner can switch to them later after runtime
 * model-switchable failures.
 */
export interface GoalModelResolutionCandidatePlanEntry {
  /** 0-based index into the source binding's candidate array. */
  candidateIndex: number;
  /** Concrete model id for this candidate. */
  model: string;
  /** Capability compliance evaluation for this candidate. */
  compliance: {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
  };
  /** True when this candidate is eligible for runtime selection/fallback. */
  eligible: boolean;
  /** Optional human-readable reason when the candidate is ineligible. */
  reason?: string;
}

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
    /** Which harness binding (catalog binding id) was used. */
    bindingSource?: string;
    /**
     * 0-based index into the source binding's candidate chain that was
     * ultimately selected.  Absent when status is "blocked" or no
     * candidate chain exists.
     */
    candidateIndex?: number;
  };
  compliance: {
    satisfiesMinimum: boolean;
    downgraded: boolean;
    missingCapabilities: string[];
  };
  /**
   * Ordered list of per-candidate attempt records capturing which
   * candidates were tried, in what order, and their resolution outcome.
   * Present when the binding uses a candidate chain (v2 catalog) or
   * fallback logic is exercised.
   */
  attemptedCandidates?: GoalModelResolutionAttemptedCandidate[];
  /**
   * Chronological list of switch (fallback) events recorded during
   * resolution.  Each entry records a move from one candidate to the
   * next in the chain.
   */
  switchEvents?: GoalModelResolutionSwitchEvent[];
  /** Full ordered candidate plan used for runtime fallback switching. */
  candidatePlan?: GoalModelResolutionCandidatePlanEntry[];
  /** Retry policy copied from the source binding catalog, when configured. */
  retryPolicy?: GoalModelBindingRetryPolicy;
  /**
   * True when every candidate in the chain has been exhausted without
   * a successful resolution.
   */
  exhaustedChain?: boolean;
  status: "resolved" | "blocked" | "warn";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------

const ATTEMPTED_CANDIDATE_STATUS_VALUES = ["succeeded", "failed", "skipped", "error"] as const;

export function parseGoalModelResolutionJson(
  json: string,
  path = "modelResolution",
): GoalModelResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid goal model resolution JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseGoalModelResolution(parsed, path);
}

export function parseGoalModelResolution(
  input: unknown,
  path = "modelResolution",
): GoalModelResolution {
  if (!isRecord(input))
    throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(
    input,
    [
      "schemaVersion",
      "harness",
      "requested",
      "resolved",
      "compliance",
      "attemptedCandidates",
      "switchEvents",
      "candidatePlan",
      "retryPolicy",
      "exhaustedChain",
      "status",
      "reason",
    ],
    path,
  );
  if (input.schemaVersion !== "1.0")
    throw new Error(
      `Invalid goal model resolution: ${path}.schemaVersion must be "1.0"`,
    );
  const harness = requireNonEmptyString(input.harness, `${path}.harness`);
  const requested = parseRequested(input.requested, `${path}.requested`);
  const resolved =
    input.resolved === undefined
      ? undefined
      : parseResolved(input.resolved, `${path}.resolved`);
  const compliance = parseCompliance(input.compliance, `${path}.compliance`);
  const attemptedCandidates =
    input.attemptedCandidates === undefined
      ? undefined
      : parseAttemptedCandidates(
          input.attemptedCandidates,
          `${path}.attemptedCandidates`,
        );
  const switchEvents =
    input.switchEvents === undefined
      ? undefined
      : parseSwitchEvents(input.switchEvents, `${path}.switchEvents`);
  const candidatePlan =
    input.candidatePlan === undefined
      ? undefined
      : parseCandidatePlan(input.candidatePlan, `${path}.candidatePlan`);
  const retryPolicy =
    input.retryPolicy === undefined
      ? undefined
      : parseRetryPolicy(input.retryPolicy, `${path}.retryPolicy`);
  const exhaustedChain =
    input.exhaustedChain === undefined
      ? undefined
      : requireBoolean(input.exhaustedChain, `${path}.exhaustedChain`);
  const status = parseStatus(input.status, `${path}.status`);
  const reason =
    input.reason === undefined
      ? undefined
      : requireNonEmptyString(input.reason, `${path}.reason`);
  return {
    schemaVersion: "1.0",
    harness,
    requested,
    ...(resolved ? { resolved } : {}),
    compliance,
    ...(attemptedCandidates ? { attemptedCandidates } : {}),
    ...(switchEvents ? { switchEvents } : {}),
    ...(candidatePlan ? { candidatePlan } : {}),
    ...(retryPolicy ? { retryPolicy } : {}),
    ...(exhaustedChain !== undefined ? { exhaustedChain } : {}),
    status,
    ...(reason ? { reason } : {}),
  };
}

// ---------------------------------------------------------------------------
// Derived evaluation — build resolution evidence from a model class and
// binding
// ---------------------------------------------------------------------------

/**
 * Evaluate a candidate chain binding against a model class and produce
 * resolution evidence plus the full runtime candidate plan.
 *
 * `attemptedCandidates` records the candidates actually walked during initial
 * resolution and stops at the first eligible candidate. `candidatePlan` keeps
 * every operator-ordered candidate with capability eligibility so the runner can
 * later switch to unattempted eligible candidates after runtime model-switchable
 * failures.
 */
export function evaluateGoalModelResolutionCandidates(
  modelClass: GoalModelClass,
  binding: GoalModelBinding,
): {
  attemptedCandidates: GoalModelResolutionAttemptedCandidate[];
  switchEvents: GoalModelResolutionSwitchEvent[];
  candidatePlan: GoalModelResolutionCandidatePlanEntry[];
  retryPolicy?: GoalModelBindingRetryPolicy;
  exhaustedChain: boolean;
  resolvedCandidateIndex?: number;
} {
  const candidates = getGoalModelBindingCandidates(binding);
  const attemptedCandidates: GoalModelResolutionAttemptedCandidate[] = [];
  const switchEvents: GoalModelResolutionSwitchEvent[] = [];
  const candidatePlan: GoalModelResolutionCandidatePlanEntry[] = [];
  let resolvedCandidateIndex: number | undefined;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const compliance = evaluateGoalModelBindingCandidateCompliance(modelClass, candidate);
    const eligible = compliance.status === "resolved" || compliance.status === "warn";
    const reason = !eligible && compliance.missingCapabilities.length > 0
      ? `missing capabilities: ${compliance.missingCapabilities.join(", ")}`
      : undefined;

    candidatePlan.push({
      candidateIndex: index,
      model: candidate.model,
      compliance: {
        satisfiesMinimum: compliance.satisfiesMinimum,
        downgraded: compliance.downgraded,
        missingCapabilities: compliance.missingCapabilities,
      },
      eligible,
      ...(reason ? { reason } : {}),
    });

    if (resolvedCandidateIndex !== undefined) continue;

    const attempt: GoalModelResolutionAttemptedCandidate = {
      candidateIndex: index,
      model: candidate.model,
      compliance: {
        satisfiesMinimum: compliance.satisfiesMinimum,
        downgraded: compliance.downgraded,
        missingCapabilities: compliance.missingCapabilities,
      },
      status: eligible ? "succeeded" : "failed",
      ...(reason ? { reason } : {}),
    };

    attemptedCandidates.push(attempt);

    if (attempt.status === "succeeded") {
      resolvedCandidateIndex = index;
      continue;
    }

    // Record resolution-time fallback to the next candidate if available.
    if (index + 1 < candidates.length) {
      switchEvents.push({
        fromCandidateIndex: index,
        fromModel: candidate.model,
        toCandidateIndex: index + 1,
        toModel: candidates[index + 1]!.model,
        reason: "candidate_failed_compliance",
      });
    }
  }

  const exhaustedChain = resolvedCandidateIndex === undefined && candidates.length > 0;
  const retryPolicy = bindingRetryPolicy(binding);

  return {
    attemptedCandidates,
    switchEvents,
    candidatePlan,
    ...(retryPolicy ? { retryPolicy } : {}),
    exhaustedChain,
    resolvedCandidateIndex,
  };
}

// ---------------------------------------------------------------------------
// Internal parse helpers
// ---------------------------------------------------------------------------

function parseRequested(
  input: unknown,
  path: string,
): GoalModelResolution["requested"] {
  if (!isRecord(input))
    throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(
    input,
    ["role", "modelScenario", "modelClass", "minimumRequirements"],
    path,
  );
  const role =
    input.role === undefined
      ? undefined
      : requireNonEmptyString(input.role, `${path}.role`);
  const modelScenario =
    input.modelScenario === undefined
      ? undefined
      : requireNonEmptyString(
          input.modelScenario,
          `${path}.modelScenario`,
        );
  const modelClass = requireNonEmptyString(
    input.modelClass,
    `${path}.modelClass`,
  );
  const minimumRequirements = parseGoalModelMinimumRequirements(
    input.minimumRequirements,
    `${path}.minimumRequirements`,
  );
  return {
    ...(role ? { role } : {}),
    ...(modelScenario ? { modelScenario } : {}),
    modelClass,
    minimumRequirements,
  };
}

function parseResolved(
  input: unknown,
  path: string,
): NonNullable<GoalModelResolution["resolved"]> {
  if (!isRecord(input))
    throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["model", "bindingSource", "candidateIndex"], path);
  const model = requireNonEmptyString(input.model, `${path}.model`);
  const bindingSource =
    input.bindingSource === undefined
      ? undefined
      : requireNonEmptyString(input.bindingSource, `${path}.bindingSource`);
  const candidateIndex =
    input.candidateIndex === undefined
      ? undefined
      : requireNonNegativeInteger(
          input.candidateIndex,
          `${path}.candidateIndex`,
        );
  const result: NonNullable<GoalModelResolution["resolved"]> = { model };
  if (bindingSource !== undefined) result.bindingSource = bindingSource;
  if (candidateIndex !== undefined) result.candidateIndex = candidateIndex;
  return result;
}

function parseCompliance(
  input: unknown,
  path: string,
): GoalModelResolution["compliance"] {
  if (!isRecord(input))
    throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(
    input,
    ["satisfiesMinimum", "downgraded", "missingCapabilities"],
    path,
  );
  if (typeof input.satisfiesMinimum !== "boolean")
    throw new Error(
      `Invalid goal model resolution: ${path}.satisfiesMinimum must be boolean`,
    );
  if (typeof input.downgraded !== "boolean")
    throw new Error(
      `Invalid goal model resolution: ${path}.downgraded must be boolean`,
    );
  if (!Array.isArray(input.missingCapabilities))
    throw new Error(
      `Invalid goal model resolution: ${path}.missingCapabilities must be an array`,
    );
  return {
    satisfiesMinimum: input.satisfiesMinimum,
    downgraded: input.downgraded,
    missingCapabilities: input.missingCapabilities.map(
      (item: unknown, index: number) =>
        requireNonEmptyString(
          item,
          `${path}.missingCapabilities[${index}]`,
        ),
    ),
  };
}

function parseAttemptedCandidates(
  input: unknown,
  path: string,
): GoalModelResolutionAttemptedCandidate[] {
  if (!Array.isArray(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an array`,
    );
  if (input.length === 0)
    throw new Error(
      `Invalid goal model resolution: ${path} must not be empty`,
    );
  return input.map((item: unknown, index: number) =>
    parseAttemptedCandidate(item, `${path}[${index}]`),
  );
}

function parseAttemptedCandidate(
  input: unknown,
  path: string,
): GoalModelResolutionAttemptedCandidate {
  if (!isRecord(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an object`,
    );
  assertKnownKeys(
    input,
    ["candidateIndex", "model", "compliance", "status", "reason"],
    path,
  );
  const candidateIndex = requireNonNegativeInteger(
    input.candidateIndex,
    `${path}.candidateIndex`,
  );
  const model = requireNonEmptyString(input.model, `${path}.model`);
  const compliance = parseAttemptCompliance(
    input.compliance,
    `${path}.compliance`,
  );
  const status = parseEnum(
    input.status,
    ATTEMPTED_CANDIDATE_STATUS_VALUES,
    `${path}.status`,
  );
  const reason =
    input.reason === undefined
      ? undefined
      : requireNonEmptyString(input.reason, `${path}.reason`);
  const result: GoalModelResolutionAttemptedCandidate = {
    candidateIndex,
    model,
    compliance,
    status,
  };
  if (reason !== undefined) result.reason = reason;
  return result;
}

function parseAttemptCompliance(
  input: unknown,
  path: string,
): GoalModelResolutionAttemptedCandidate["compliance"] {
  if (!isRecord(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an object`,
    );
  assertKnownKeys(
    input,
    ["satisfiesMinimum", "downgraded", "missingCapabilities"],
    path,
  );
  if (typeof input.satisfiesMinimum !== "boolean")
    throw new Error(
      `Invalid goal model resolution: ${path}.satisfiesMinimum must be boolean`,
    );
  if (typeof input.downgraded !== "boolean")
    throw new Error(
      `Invalid goal model resolution: ${path}.downgraded must be boolean`,
    );
  if (!Array.isArray(input.missingCapabilities))
    throw new Error(
      `Invalid goal model resolution: ${path}.missingCapabilities must be an array`,
    );
  return {
    satisfiesMinimum: input.satisfiesMinimum,
    downgraded: input.downgraded,
    missingCapabilities: input.missingCapabilities.map(
      (item: unknown, index: number) =>
        requireNonEmptyString(
          item,
          `${path}.missingCapabilities[${index}]`,
        ),
    ),
  };
}

function parseCandidatePlan(
  input: unknown,
  path: string,
): GoalModelResolutionCandidatePlanEntry[] {
  if (!Array.isArray(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an array`,
    );
  if (input.length === 0)
    throw new Error(
      `Invalid goal model resolution: ${path} must not be empty`,
    );
  return input.map((item: unknown, index: number) =>
    parseCandidatePlanEntry(item, `${path}[${index}]`),
  );
}

function parseCandidatePlanEntry(
  input: unknown,
  path: string,
): GoalModelResolutionCandidatePlanEntry {
  if (!isRecord(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an object`,
    );
  assertKnownKeys(
    input,
    ["candidateIndex", "model", "compliance", "eligible", "reason"],
    path,
  );
  const candidateIndex = requireNonNegativeInteger(
    input.candidateIndex,
    `${path}.candidateIndex`,
  );
  const model = requireNonEmptyString(input.model, `${path}.model`);
  const compliance = parseAttemptCompliance(
    input.compliance,
    `${path}.compliance`,
  );
  const eligible = requireBoolean(input.eligible, `${path}.eligible`);
  const reason =
    input.reason === undefined
      ? undefined
      : requireNonEmptyString(input.reason, `${path}.reason`);
  return {
    candidateIndex,
    model,
    compliance,
    eligible,
    ...(reason ? { reason } : {}),
  };
}

function parseSwitchEvents(
  input: unknown,
  path: string,
): GoalModelResolutionSwitchEvent[] {
  if (!Array.isArray(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an array`,
    );
  return input.map((item: unknown, index: number) =>
    parseSwitchEvent(item, `${path}[${index}]`),
  );
}

function parseSwitchEvent(
  input: unknown,
  path: string,
): GoalModelResolutionSwitchEvent {
  if (!isRecord(input))
    throw new Error(
      `Invalid goal model resolution: ${path} must be an object`,
    );
  assertKnownKeys(
    input,
    [
      "fromCandidateIndex",
      "fromModel",
      "toCandidateIndex",
      "toModel",
      "reason",
    ],
    path,
  );
  const fromCandidateIndex = requireNonNegativeInteger(
    input.fromCandidateIndex,
    `${path}.fromCandidateIndex`,
  );
  const fromModel = requireNonEmptyString(input.fromModel, `${path}.fromModel`);
  const toCandidateIndex = requireNonNegativeInteger(
    input.toCandidateIndex,
    `${path}.toCandidateIndex`,
  );
  const toModel = requireNonEmptyString(input.toModel, `${path}.toModel`);
  const reason = requireNonEmptyString(input.reason, `${path}.reason`);
  return { fromCandidateIndex, fromModel, toCandidateIndex, toModel, reason };
}

function parseRetryPolicy(input: unknown, path: string): GoalModelBindingRetryPolicy {
  if (!isRecord(input)) throw new Error(`Invalid goal model resolution: ${path} must be an object`);
  assertKnownKeys(input, ["attemptsPerCandidate"], path);
  const attemptsPerCandidate = input.attemptsPerCandidate;
  if (typeof attemptsPerCandidate !== "number" || !Number.isInteger(attemptsPerCandidate) || attemptsPerCandidate < 1) {
    throw new Error(`Invalid goal model resolution: ${path}.attemptsPerCandidate must be a positive integer`);
  }
  return { attemptsPerCandidate };
}

function parseStatus(
  input: unknown,
  path: string,
): GoalModelResolution["status"] {
  if (input !== "resolved" && input !== "blocked" && input !== "warn")
    throw new Error(
      `Invalid goal model resolution: ${path} must be resolved, blocked, or warn`,
    );
  return input;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function bindingRetryPolicy(binding: GoalModelBinding): GoalModelBindingRetryPolicy | undefined {
  const maybe = binding as { retryPolicy?: GoalModelBindingRetryPolicy };
  return maybe.retryPolicy ? { ...maybe.retryPolicy } : undefined;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim())
    throw new Error(`Invalid value at ${path}: expected non-empty string`);
  return input.trim();
}

function requireBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean")
    throw new Error(`Invalid value at ${path}: expected boolean`);
  return input;
}

function requireNonNegativeInteger(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0)
    throw new Error(`Invalid value at ${path}: expected non-negative integer`);
  return input;
}

function parseEnum<T extends string>(
  input: unknown,
  values: readonly T[],
  path: string,
): T {
  if (
    typeof input !== "string" ||
    !(values as readonly string[]).includes(input)
  ) {
    throw new Error(
      `Invalid value at ${path}: expected one of ${values.join(", ")}`,
    );
  }
  return input as T;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function assertKnownKeys(
  input: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key))
      throw new Error(
        `Invalid field at ${path}: ${JSON.stringify(key)} is not supported`,
      );
  }
}
