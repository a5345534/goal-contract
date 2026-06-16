# goal-contract

Shared pipeline contract for `goal-spec`, `goal-dag`, and `goal-runner`.

This package owns the protocol layer — schemas, pure types, and validators —
that the three pipeline stages agree on. It does **not** contain any runtime
behaviour, planning logic, authoring workflow, or adapter code.

## Exports

| Module | Purpose |
| --- | --- |
| `openspec-source-manifest.ts` | `source-manifest.json` shape and parser |
| `validation-evidence.ts` | Canonical `requiredEvidence` token registry |
| `model-routing.ts` | Model-routing config shape and contract parser |
| `goal-dag-types.ts` | Goal DAG file on-disk types |
| `goal-dag-parser.ts` | Pure Goal DAG file parser (no runtime materialisation) |

## Schemas

- `schemas/source-manifest.schema.json`
- `schemas/goal-dag.schema.json`
- `schemas/model-routing.schema.json`

## Architecture

```text
goal-contract  (protocol, schemas, pure validation)
      ↑
      ├── goal-spec   (OpenSpec authoring)
      ├── goal-dag    (DAG planning + trace)
      └── goal-runner (runtime execution)
```
