# goal-contract

Shared pipeline contract for `goal-spec`, `goal-dag`, and `goal-runner`.

This package owns the protocol layer — schemas, pure types, and validators —
that the three pipeline stages agree on. It does **not** contain any runtime
behaviour, planning logic, authoring workflow, or adapter code.

**goal-contract defines binding shape and the abstract model-class catalog,
but does not ship adapter binding instances.** Harness binding catalogs
(pi.json, opencode.json, etc.) belong to `goal-runner`.

## Exports

| Module | Purpose |
| --- | --- |
| `model-class.ts` | Abstract `modelClass` vocabulary and minimum-requirements contract |
| `model-binding.ts` | Harness binding shape (`modelClass` → concrete model mapping) |
| `model-resolution.ts` | Runtime model resolution result shape |
| `openspec-source-manifest.ts` | `source-manifest.json` shape and parser |
| `validation-evidence.ts` | Canonical `requiredEvidence` token registry |
| `model-routing.ts` | Model-routing config shape and contract parser |
| `goal-dag-types.ts` | Goal DAG file on-disk types |
| `goal-dag-parser.ts` | Pure Goal DAG file parser (no runtime materialisation) |

## Schemas

- `schemas/source-manifest.schema.json`
- `schemas/goal-dag.schema.json`
- `schemas/model-routing.schema.json`
- `schemas/model-class-catalog.schema.json`
- `schemas/model-binding.schema.json`
- `schemas/model-resolution.schema.json`

## Catalogs

- `catalogs/model-classes.json` — abstract model-class catalog (`controller`, `implementation`, `strict-reviewer`, `evidence-collector`, `value-judge`, `spec-writer`, `explainer-writer`, `frontier`, `reasoning`, `spark`)

## Architecture

```text
goal-contract  (abstract schemas, types, catalog — no binding instances)
      ↑
      ├── goal-spec   (Stage 1 — Spec Ideation Authoring Flow)
      ├── goal-dag    (Stage 2 — DAG planning + trace)
      └── goal-runner (Stage 3 — harness binding catalogs, runtime resolution)
```
