# Implementation Discipline Contract Spec

Status: implemented (v1)  
Owner: `goal-contract`  
Applies to: shared schemas/types consumed by `goal-spec`, `goal-dag`, and `goal-runner`

## Purpose

Define the portable contract vocabulary for a Karpathy-inspired implementation discipline without depending on the upstream `andrej-karpathy-skills` package. The discipline is treated as a shared quality profile and clarification protocol, not as a hard-coded prompt bundle.

## Decisions

1. The shared profile name is `implementation-discipline`.
2. The profile captures four behavioral requirements:
   - think before coding;
   - simplicity first;
   - surgical changes;
   - goal-driven verification.
3. Subagents must not ask the user directly. If material uncertainty remains, they surface a structured question to the controller.
4. The controller is the first responder for subagent questions. Human escalation is only for decisions the controller cannot safely answer from existing context.
5. Existing status vocabulary should be reused where possible. A human-required question may be represented as a blocked node with actionable evidence before introducing a new terminal status.

## Quality Profile Semantics

A node that includes `implementation-discipline` asks the executor to satisfy these constraints:

- **Assumptions**: state material assumptions; do not silently pick an interpretation when alternatives materially affect behavior.
- **Simplicity**: implement the minimum solution that satisfies the node objective and validation contract; avoid speculative extensibility.
- **Surgical scope**: every changed line must trace to the node objective, validation contract, or required cleanup caused by the change.
- **Verification**: report concrete verification evidence, not only self-certification.

## Structured Question Envelope

If promoted into a schema, a controller-facing clarification should preserve these fields:

```json
{
  "question": "What needs to be decided?",
  "whyItMatters": "Why this affects correctness, compatibility, scope, or validation.",
  "options": [
    { "id": "a", "summary": "Option A", "tradeoffs": "Cost/risk/benefit" }
  ],
  "recommendedDefault": "a",
  "blocking": true,
  "neededFrom": "controller|human|external-state"
}
```

The runtime may initially carry this envelope in transcript text, but the contract should remain stable enough to become a typed field later.

## Backward Compatibility

- Unknown quality profiles already fail closed or require explicit support in downstream components; adding `implementation-discipline` should follow that pattern.
- Producers may emit the profile only when the runner version supports it, or when a compatibility flag allows advisory-only profiles.
- The clarification envelope can be introduced as advisory metadata before becoming a required schema field.

## Acceptance Criteria

- A future contract change can represent `implementation-discipline` without embedding provider-specific prompt text.
- A future contract change can serialize controller-facing questions without requiring subagents to contact users directly.
- Downstream repositories can independently adopt the profile while preserving existing DAG and status compatibility.

## Implementation Notes (v1)

### Quality Profile

`implementation-discipline` has been added to the shared `GoalQualityProfile` closed union:

| Location | Change |
|---|---|
| `src/goal-dag-types.ts` | Added `"implementation-discipline"` to `ALL_GOAL_QUALITY_PROFILES` array and re-exported via `GoalQualityProfile` type. |
| `schemas/goal-dag.schema.json` | Added `"implementation-discipline"` to the `qualityProfile` JSON Schema enum. |

The parser (`goal-dag-parser.ts`) already calls `requireGoalQualityProfile()` for validation, so the new value is automatically accepted without parser changes.

### Controller-Facing Question Envelope

A new typed controller-facing question envelope has been added as an advisory contract:

| Location | Content |
|---|---|
| `src/controller-question.ts` | `ControllerQuestion` interface, `ControllerQuestionOption` interface, `ControllerQuestionNeededFrom` union, `parseControllerQuestion()` validator, `isControllerQuestion()` type guard. |
| `schemas/controller-question.schema.json` | JSON Schema for the question envelope (advisory; not embedded in `goal-dag.schema.json` yet). |
| `src/tests/controller-question.test.ts` | Unit tests for valid and invalid question shapes. |

The envelope fields match the design spec exactly:
- `question`, `whyItMatters`, `options[].{id,summary,tradeoffs}`, `recommendedDefault`, `blocking`, `neededFrom`

### Boundaries Preserved

- No provider/model ids, harness-specific prompt prose, or implementation-level instructions appear in any shared schema or type.
- The profile is additive; existing DAGs and goals that omit `implementation-discipline` remain valid.
- The question envelope type is available for downstream consumers but not yet required as a DAG node field.

### TypeScript Exports

```typescript
import {
  parseControllerQuestion,
  isControllerQuestion,
  type ControllerQuestion,
  type ControllerQuestionOption,
  type ControllerQuestionNeededFrom,
} from "goal-contract";
```
