# Implementation Discipline Contract Spec

Status: draft  
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
