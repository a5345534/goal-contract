# Slice 07：Policy / Permission / Workspace Safety Lite 實作規格書

## 1. Slice 名稱

```text
Slice 07：Policy / Permission / Workspace Safety Lite
```

建議 OpenSpec 命名：

```text
Change name: add-slice07-policy-permission-workspace-safety-lite
Capability name: workspace-policy-safety
```

規格檔路徑：

```text
digital-employee-platform/docs/specs/slice-07-policy-permission-workspace-safety-lite.md
```

---

## 2. 背景

Slice 01–06.5 已形成 Lite MVP 穩定基線：

```text
workspace / digital employee
chat → workflow run
proposal / approval
code task / repository PR
deployment action
artifact / audit
memory context
workflow governance
pause / resume / cancel / retry
retry approval gate
workflow observability
operator dashboard
timeline / failure drilldown / audit viewer polish
```

目前系統已經能執行與治理 workflow，但仍缺少一層一致的安全基線：

```text
誰可以做什麼？
哪些 action 必須被阻擋？
為什麼被阻擋？
是否所有 mutating action 都有 actor？
是否所有 policy deny 都有 audit？
agent 是否能越權 approve / deploy / retry / cancel？
system action 是否一定有前置 approval 或可信來源？
```

Slice 07 的目標不是做完整 IAM，而是建立 **workspace-level policy and permission baseline**，讓前面所有高風險操作都有一致的 `ActorContext`、`PolicyDecision`、`deny reason`、`audit trail` 與 UI feedback。

---

## 3. 核心定位

Slice 07 是：

```text
Workspace safety baseline slice.
```

它要建立：

```text
Actor identity context
Workspace role model
Permission matrix
Policy evaluation service
Policy guard for mutating endpoints
Policy decision audit
Deny reason propagation
Operator-visible policy decision history
Frontend disabled actions / permission hints
```

它不是：

```text
Production IAM
SSO / OAuth
OPA / OpenFGA
multi-tenant enterprise permission system
external identity provider
complete security boundary
```

本 Slice 在 Lite MVP 中的定位是：

```text
一致化權限判斷與安全阻擋，而不是建立完整身份基礎設施。
```

---

## 4. 核心目標

Slice 07 必須完成：

```text
1. ActorContext：每個 mutating request 都能解析 actorType / actorId / actorRole。
2. WorkspaceRole：owner / operator / viewer / agent / system。
3. Permission matrix：定義 role 可執行的 action。
4. PolicyDecision：allow / deny / require_approval 的一致回傳模型。
5. PolicyGuard：在高風險與 mutating endpoints 前執行。
6. PolicyDecision persistence：記錄 allow / deny / require_approval decision。
7. Audit integration：每次 deny 必須寫 audit；高風險 allow 也要可追蹤。
8. UI integration：沒有權限的 action disabled，並顯示原因。
9. Operator policy page：可查看目前 workspace policy 與 decision history。
10. Tests：unit / API / E2E 驗證 deny 不產生副作用。
```

---

## 5. 非目標

Slice 07 不做：

```text
OAuth
SSO
JWT auth
password login
session management
organization sync
team sync
external IAM
OPA
OpenFGA
Casbin
Kubernetes RBAC
secret manager
KMS
credential vault
billing / tenant isolation
production-grade zero trust
data retention policy
audit signing
legal compliance workflow
network sandbox policy
fine-grained file path permissions
branch protection integration with real GitHub rules
```

特別限制：

```text
No external policy engine.
No new workflow semantics.
No automatic approval.
No automatic remediation.
No bulk permission mutation.
No hidden bypass path for agent/system.
```

---

## 6. 安全設計原則

### 6.1 Default deny for mutating actions

所有 mutating action 如果沒有明確 policy allow，必須 deny。

```text
No actor context → deny
Unknown actor role → deny
Unknown action → deny
Unknown resource type → deny
Workspace not found → deny
Workspace inactive / archived → deny
```

### 6.2 Read actions can be permissive but explicit

Read action 可以比 write action 寬鬆，但仍必須經過 workspace membership / role 判斷。

```text
viewer can read
operator can read + control
owner can manage
agent can read limited operational context
system can read/write only through trusted internal paths
```

### 6.3 Agent cannot approve itself

Agent 不得直接 approve：

```text
proposal
deployment
workflow_control_action retry
policy change
repository write authorization
```

Agent 可以 request、execute、report，但不能作為最終 authority。

### 6.4 System action must be explainable

System action 必須有來源：

```text
approved proposal
approved deployment
approved retry control action
internal mock runner transition
explicit system maintenance action
```

如果 system action 沒有前置可追蹤依據，必須 deny 或至少寫 high severity audit。

### 6.5 Policy decision must be source-bound

每個 decision 應保留：

```text
actor
action
resource
workspace
decision
reasonCode
reason
metadata
createdAt
```

---

## 7. ActorContext

### 7.1 Actor types

```ts
export type ActorType = 'user' | 'agent' | 'system';
```

### 7.2 Workspace roles

```ts
export type WorkspaceRole =
  | 'owner'
  | 'operator'
  | 'viewer'
  | 'agent'
  | 'system';
```

### 7.3 ActorContext shape

```ts
export interface ActorContext {
  actorType: ActorType;
  actorId: string;
  workspaceId: string;
  role: WorkspaceRole;
  source:
    | 'request_header'
    | 'dev_default'
    | 'workflow_runner'
    | 'system_internal'
    | 'test';
  authenticated: boolean;
  metadata: Record<string, unknown> | null;
}
```

### 7.4 Lite actor resolution

Slice 07 不做正式登入系統，因此 actor 解析採 Lite 模式：

```text
1. If x-actor-id / x-actor-type / x-actor-role headers exist:
   use header actor context in dev/test mode.

2. Else if request is internal workflow runner:
   use system actor.

3. Else:
   use dev default actor:
   actorType = user
   actorId = local-dev-user
   role = owner
```

限制：

```text
Header-based actor override is dev/test only.
Production mode must not trust arbitrary actor headers.
```

可以用環境變數控制：

```text
ENABLE_DEV_ACTOR_HEADERS=true | false
```

---

## 8. Permission Action Taxonomy

### 8.1 Workspace actions

```ts
workspace.read
workspace.manage
workspace.member.read
workspace.member.manage
workspace.policy.read
workspace.policy.manage
```

### 8.2 Workflow actions

```ts
workflow.read
workflow.control.pause
workflow.control.resume
workflow.control.cancel
workflow.control.retry
workflow.control.approve
workflow.control.reject
workflow.observability.read
```

### 8.3 Proposal / approval actions

```ts
proposal.read
proposal.create
proposal.approve
proposal.reject
approval.read
approval.decide
```

### 8.4 Repository / code actions

```ts
repository.read
repository.manage
repository.verify
repository.write
code_task.read
code_task.create
code_task.execute
```

### 8.5 Deployment actions

```ts
deployment.read
deployment.request
deployment.approve
deployment.reject
deployment.execute
```

### 8.6 Memory actions

```ts
memory.read
memory.create
memory.update
memory.archive
memory.delete
```

### 8.7 Audit / policy actions

```ts
audit.read
policy.decision.read
policy.evaluate
```

---

## 9. Role Permission Matrix

### 9.1 Owner

Owner 可以：

```text
workspace.*
workflow.*
proposal.*
approval.*
repository.*
code_task.*
deployment.*
memory.*
audit.read
policy.*
```

限制：

```text
owner 仍不能繞過 required approval flow。
owner 可以 approve，但 approval 必須留下 decision note / audit。
```

### 9.2 Operator

Operator 可以：

```text
workspace.read
workflow.read
workflow.control.pause
workflow.control.resume
workflow.control.cancel
workflow.control.retry
workflow.control.approve
workflow.control.reject
workflow.observability.read
proposal.read
proposal.approve
proposal.reject
approval.read
approval.decide
repository.read
repository.verify
code_task.read
deployment.read
deployment.request
deployment.approve
deployment.reject
memory.read
memory.create
memory.update
memory.archive
audit.read
policy.decision.read
```

Operator 不可以：

```text
workspace.manage
workspace.member.manage
workspace.policy.manage
repository.manage
repository.write direct
deployment.execute direct
code_task.execute direct
memory.delete
```

### 9.3 Viewer

Viewer 可以：

```text
workspace.read
workflow.read
workflow.observability.read
proposal.read
approval.read
repository.read
code_task.read
deployment.read
memory.read
audit.read
policy.decision.read
```

Viewer 不可以：

```text
任何 mutating action
任何 approval decision
任何 workflow control action
```

### 9.4 Agent

Agent 可以：

```text
workflow.read
workflow.observability.read limited
proposal.create
proposal.read own-related
code_task.create
code_task.read
memory.read scoped
memory.create scoped
repository.read
deployment.read
```

Agent 不可以：

```text
proposal.approve
proposal.reject
approval.decide
deployment.approve
deployment.reject
workflow.control.approve
workspace.policy.manage
workspace.member.manage
repository.manage
direct deployment.execute without approval
direct repository.write without approved code task
```

### 9.5 System

System 可以：

```text
workflow state transition from trusted internal runner
code_task.execute after approved proposal
repository.write after approved code task
deployment.execute after approved deployment request
memory.create from approved workflow context
audit write
```

System 不可以：

```text
create arbitrary approval
approve approval
change policy
change workspace members
execute unapproved high-risk operation
```

---

## 10. PolicyDecision

### 10.1 Decision effect

```ts
export type PolicyDecisionEffect =
  | 'allow'
  | 'deny'
  | 'require_approval';
```

### 10.2 Decision shape

```ts
export interface PolicyDecision {
  id: string;
  workspaceId: string;

  actorType: ActorType;
  actorId: string;
  actorRole: WorkspaceRole;

  action: PolicyAction;
  resourceType: string;
  resourceId: string | null;

  effect: PolicyDecisionEffect;
  allowed: boolean;

  reasonCode: PolicyReasonCode;
  reason: string;

  metadata: Record<string, unknown> | null;

  createdAt: string;
}
```

### 10.3 Reason codes

```ts
export type PolicyReasonCode =
  | 'allowed_by_role'
  | 'allowed_system_internal'
  | 'allowed_after_approval'
  | 'denied_no_actor'
  | 'denied_unknown_role'
  | 'denied_unknown_action'
  | 'denied_workspace_inactive'
  | 'denied_role_not_allowed'
  | 'denied_agent_cannot_approve'
  | 'denied_system_missing_approval'
  | 'denied_retry_not_allowed'
  | 'denied_non_retryable_failure'
  | 'denied_max_retry_exceeded'
  | 'denied_repository_unverified'
  | 'denied_protected_branch'
  | 'denied_deployment_requires_approval'
  | 'denied_policy_locked'
  | 'denied_secret_like_content'
  | 'requires_existing_approval_flow'
  | 'unknown';
```

---

## 11. DB Schema

### 11.1 workspace_member

新增 table：

```ts
workspace_member {
  id: uuid primary key
  workspace_id: uuid not null references workspace(id)
  actor_type: enum('user', 'agent', 'system')
  actor_id: text not null
  role: enum('owner', 'operator', 'viewer', 'agent', 'system')
  status: enum('active', 'disabled')
  created_at: timestamp
  updated_at: timestamp

  unique(workspace_id, actor_type, actor_id)
}
```

用途：

```text
定義 actor 在 workspace 內的 role。
Lite mode 可自動 seed local-dev-user owner。
```

### 11.2 workspace_policy

新增 table：

```ts
workspace_policy {
  id: uuid primary key
  workspace_id: uuid not null references workspace(id)
  key: text not null
  value: jsonb not null
  enabled: boolean not null default true
  created_at: timestamp
  updated_at: timestamp

  unique(workspace_id, key)
}
```

建議 policy keys：

```text
maxRetryAttempts
allowAgentMemoryWrite
requireDeploymentApproval
requireRetryApproval
protectedBranchPatterns
allowedRepositoryWriteBranchPrefixes
blockSecretLikeMemoryContent
allowViewerAuditRead
```

### 11.3 policy_decision

新增 table：

```ts
policy_decision {
  id: uuid primary key
  workspace_id: uuid not null references workspace(id)

  actor_type: text not null
  actor_id: text not null
  actor_role: text not null

  action: text not null
  resource_type: text not null
  resource_id: uuid null

  effect: enum('allow', 'deny', 'require_approval')
  allowed: boolean not null

  reason_code: text not null
  reason: text not null

  metadata: jsonb null
  created_at: timestamp
}
```

Indexes:

```text
workspace_id + created_at desc
workspace_id + actor_id + created_at desc
workspace_id + action + created_at desc
workspace_id + effect + created_at desc
resource_type + resource_id
```

---

## 12. Default Workspace Policy

每個 workspace 預設 policy：

```json
{
  "maxRetryAttempts": 3,
  "allowAgentMemoryWrite": true,
  "requireDeploymentApproval": true,
  "requireRetryApproval": true,
  "protectedBranchPatterns": ["main", "master", "develop", "release/*"],
  "allowedRepositoryWriteBranchPrefixes": ["agent/", "workflow/", "slice/"],
  "blockSecretLikeMemoryContent": true,
  "allowViewerAuditRead": true
}
```

限制：

```text
Slice 07 允許 owner 修改部分 workspace policy。
但不允許刪除所有 safety defaults。
```

不可關閉：

```text
agent cannot approve
system cannot approve
policy decision audit
deny on missing actor
deny on unknown action
```

---

## 13. Policy Evaluation Rules

### 13.1 Generic permission rule

```text
If role does not include action:
  deny role_not_allowed.
```

### 13.2 Agent approval rule

```text
If actorType = agent AND action in approval decision actions:
  deny agent_cannot_approve.
```

Approval decision actions include:

```text
proposal.approve
proposal.reject
deployment.approve
deployment.reject
workflow.control.approve
workflow.control.reject
approval.decide
```

### 13.3 System approval dependency rule

```text
If actorType = system AND action is high-risk execution:
  require approved upstream record.
```

Examples:

```text
code_task.execute requires approved proposal
repository.write requires approved code task / approved proposal
deployment.execute requires approved deployment approval
retry execution requires approved workflow_control_action
```

### 13.4 Retry policy

```text
workflow.control.retry:
  allowed only if workflow_run.status = failed
  latest workflow_failure.retryable = true
  retry count < maxRetryAttempts
  requireRetryApproval = true means existing retry approval flow must be used
```

If retry is requested without approval path:

```text
effect = require_approval
reasonCode = requires_existing_approval_flow
```

### 13.5 Deployment policy

```text
deployment.request:
  owner/operator only

deployment.approve:
  owner/operator only
  agent denied

deployment.execute:
  system only
  must have approved deployment approval
```

### 13.6 Repository write policy

```text
repository.write:
  system only
  repository status must be verified
  branch must not match protectedBranchPatterns
  branch must match allowedRepositoryWriteBranchPrefixes
  must be linked to approved code_task / proposal
```

### 13.7 Memory policy

```text
memory.create / memory.update:
  owner/operator allowed
  agent allowed only when allowAgentMemoryWrite = true and source is workflow context
  viewer denied
  secret-like content denied if blockSecretLikeMemoryContent = true
```

### 13.8 Policy management rule

```text
workspace.policy.manage:
  owner only
```

Even owner cannot disable immutable safety rules:

```text
agent_cannot_approve
decision audit
deny unknown action
deny missing actor
```

---

## 14. Backend Module

新增：

```text
apps/api/src/policy/policy.module.ts
apps/api/src/policy/policy.controller.ts
apps/api/src/policy/policy.service.ts
apps/api/src/policy/policy.guard.ts
apps/api/src/policy/actor-context.ts
apps/api/src/policy/policy-actions.ts
apps/api/src/policy/policy-decision.ts
apps/api/src/policy/policy-reasons.ts
apps/api/src/policy/default-policy.ts
apps/api/src/policy/permission-matrix.ts
apps/api/src/policy/policy-audit.ts
apps/api/src/policy/policy-errors.ts
```

Register in:

```text
apps/api/src/app.module.ts
```

---

## 15. PolicyService Responsibilities

```text
resolveActorContext(request, workspaceId)
getWorkspaceRole(workspaceId, actor)
getWorkspacePolicy(workspaceId)
evaluate(input): PolicyDecision
assertAllowed(input): throws PolicyDeniedException
recordDecision(decision)
writePolicyAudit(decision)
```

### 15.1 evaluate input

```ts
export interface PolicyEvaluationInput {
  workspaceId: string;
  actor: ActorContext;
  action: PolicyAction;
  resourceType: string;
  resourceId: string | null;
  resource?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}
```

### 15.2 assertAllowed behavior

```text
If effect = allow:
  return decision.

If effect = require_approval:
  throw PolicyRequiresApprovalException unless caller explicitly supports require_approval.

If effect = deny:
  throw PolicyDeniedException.
```

---

## 16. API Endpoints

### 16.1 Get workspace policy

```http
GET /api/workspaces/:workspaceId/policy
```

Permission:

```text
workspace.policy.read
```

Response:

```ts
WorkspacePolicyResponse
```

### 16.2 Update workspace policy

```http
PATCH /api/workspaces/:workspaceId/policy
```

Permission:

```text
workspace.policy.manage
```

Rules:

```text
owner only
cannot disable immutable safety rules
must write policy decision
must write audit
```

### 16.3 List policy decisions

```http
GET /api/workspaces/:workspaceId/policy/decisions?effect=&action=&actorId=&limit=
```

Permission:

```text
policy.decision.read
```

Response:

```ts
PolicyDecisionListResponse
```

### 16.4 Explain current actor capabilities

```http
GET /api/workspaces/:workspaceId/policy/capabilities
```

Response:

```ts
PolicyCapabilitiesResponse {
  actor: ActorContext;
  role: WorkspaceRole;
  allowedActions: PolicyAction[];
  deniedActions: Array<{
    action: PolicyAction;
    reasonCode: PolicyReasonCode;
    reason: string;
  }>;
}
```

### 16.5 Evaluate policy diagnostic endpoint

```http
POST /api/workspaces/:workspaceId/policy/evaluate
```

Permission:

```text
policy.evaluate
```

Purpose:

```text
Dev/operator diagnostic only.
Does not mutate target resource.
May record a policy_decision with metadata.diagnostic = true.
```

---

## 17. Integration Points

PolicyGuard must be integrated into the following.

### 17.1 Workflow governance

```text
POST /workflow-runs/:id/pause
POST /workflow-runs/:id/resume
POST /workflow-runs/:id/cancel
POST /workflow-runs/:id/retry
POST /workflow-control-actions/:id/approve
POST /workflow-control-actions/:id/reject
```

Mapped actions:

```text
workflow.control.pause
workflow.control.resume
workflow.control.cancel
workflow.control.retry
workflow.control.approve
workflow.control.reject
```

### 17.2 Proposal approval

```text
POST /proposals/:proposalId/approve
POST /proposals/:proposalId/reject
```

Mapped actions:

```text
proposal.approve
proposal.reject
approval.decide
```

### 17.3 Deployment

```text
POST /services/:serviceId/deployments
POST /deployments/:deploymentRunId/approve
POST /deployments/:deploymentRunId/reject
```

Mapped actions:

```text
deployment.request
deployment.approve
deployment.reject
```

System executor path:

```text
deployment.execute
```

### 17.4 Repository

```text
POST /repositories
PATCH /repositories/:id
POST /repositories/:id/verify
```

Mapped actions:

```text
repository.manage
repository.verify
```

Internal repository write path:

```text
repository.write
```

### 17.5 Memory

```text
POST /memory
PATCH /memory/:id
POST /memory/:id/archive
DELETE /memory/:id
```

Mapped actions:

```text
memory.create
memory.update
memory.archive
memory.delete
```

### 17.6 Audit / observability reads

```text
GET /audit
GET /operator/workflows
GET /operator/workflows/summary
GET /operator/workflows/attention
GET /workflow-runs/:id/observability
```

Mapped actions:

```text
audit.read
workflow.observability.read
```

---

## 18. UI Requirements

### 18.1 Policy page

新增 route：

```text
/workspaces/$workspaceId/policy
```

Sections:

```text
Current actor
Workspace role
Policy summary
Editable policy values
Immutable safety rules
Policy decision history
```

### 18.2 Disabled action UX

For buttons:

```text
Approve
Reject
Pause
Resume
Cancel
Retry
Deploy
Archive memory
Delete memory
Manage repository
```

If policy denies action:

```text
button disabled
tooltip shows reason
optional "View policy decision" link
```

### 18.3 Operator dashboard integration

OperatorDashboard should show policy-denied action state.

Example:

```text
Retry disabled: latest failure is non-retryable
Cancel disabled: viewer role cannot control workflow
Approve disabled: agent cannot approve
```

### 18.4 AuditViewer integration

AuditViewer should support filtering:

```text
eventType = policy.decision_allowed
eventType = policy.decision_denied
eventType = policy.decision_requires_approval
```

### 18.5 Navigation

Workspace navigation should include:

```text
Policy
```

visible to:

```text
owner
operator
viewer if allowViewerAuditRead = true
```

---

## 19. Audit Events

Add audit event types:

```text
policy.decision_allowed
policy.decision_denied
policy.decision_requires_approval
policy.policy_updated
policy.member_added
policy.member_updated
policy.member_disabled
```

Audit metadata must include:

```ts
{
  policyDecisionId: string;
  actorType: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reasonCode: string;
}
```

Minimum rule:

```text
Every deny must write audit.
High-risk allow should write policy_decision, but may not need separate audit if policy_decision table is visible.
Policy update must always write audit.
```

---

## 20. Frontend API Hooks

Add:

```ts
useWorkspacePolicy(workspaceId)
useUpdateWorkspacePolicyMutation(workspaceId)
usePolicyDecisions(workspaceId, filters)
usePolicyCapabilities(workspaceId)
useEvaluatePolicyMutation(workspaceId)
```

Mutation invalidation:

```text
workspacePolicy
policyDecisions
policyCapabilities
audit
workspace
```

---

## 21. Shared DTO / Types

Add to:

```text
packages/shared/src/enums/index.ts
packages/shared/src/dto/index.ts
packages/shared/src/types/index.ts
```

Types:

```ts
ActorType
WorkspaceRole
PolicyAction
PolicyDecisionEffect
PolicyReasonCode
ActorContext
WorkspaceMemberResponse
WorkspacePolicyResponse
UpdateWorkspacePolicyDTO
PolicyDecisionResponse
PolicyDecisionListResponse
PolicyCapabilitiesResponse
PolicyEvaluationRequestDTO
PolicyEvaluationResponse
```

---

## 22. Error Handling

### 22.1 PolicyDeniedException

HTTP:

```text
403 Forbidden
```

Response:

```ts
{
  "error": "POLICY_DENIED",
  "message": "Viewer cannot retry workflow.",
  "policyDecisionId": "...",
  "reasonCode": "denied_role_not_allowed",
  "action": "workflow.control.retry",
  "resourceType": "workflow_run",
  "resourceId": "..."
}
```

### 22.2 PolicyRequiresApprovalException

HTTP:

```text
409 Conflict
```

Response:

```ts
{
  "error": "POLICY_REQUIRES_APPROVAL",
  "message": "This action requires an existing approval flow.",
  "policyDecisionId": "...",
  "reasonCode": "requires_existing_approval_flow",
  "action": "...",
  "resourceType": "...",
  "resourceId": "..."
}
```

---

## 23. Testing Requirements

### 23.1 Unit tests

Add unit tests for:

```text
permission matrix
actor context resolver
default policy
policy evaluation allow/deny
agent cannot approve
system missing approval denied
retry max attempts
non-retryable failure denied
repository protected branch denied
deployment execute requires approval
memory secret-like content denied
policy immutable safety rule cannot be disabled
```

### 23.2 API tests

Add API tests for:

```text
viewer can read but cannot mutate
operator can pause/resume/cancel/retry
agent can create proposal but cannot approve
owner can update workspace policy
policy update denies disabling immutable rules
policy decisions are recorded
deny response includes policyDecisionId
deny does not mutate target resource
```

### 23.3 E2E tests

Add:

```text
apps/web/e2e/slice07-policy-permission-workspace-safety-lite.spec.ts
```

Scenarios:

```text
1. Policy page renders current actor and role.
2. Viewer sees workflow controls disabled.
3. Operator can pause workflow.
4. Agent cannot approve proposal.
5. Denied action appears in Policy Decision history.
6. Policy decision can be opened from AuditViewer.
7. Owner can update editable policy value.
8. Owner cannot disable immutable safety rule.
9. Retry denied when latest failure is non-retryable.
10. Existing Slice 06 / 06.5 E2E still pass.
```

---

## 24. DoD

Slice 07 is complete when:

```text
Every mutating endpoint has actor context.
Every high-risk endpoint has policy guard.
Unknown actor/action defaults to deny.
Agent cannot approve.
System execution requires approved upstream record.
Retry policy enforces retryable + maxRetryAttempts.
Repository write policy blocks protected branches.
Deployment execution requires approval.
Memory write policy blocks secret-like content.
Policy decisions are persisted.
Every deny writes audit.
UI disables denied actions with reason.
Policy page shows policy and decision history.
Unit tests pass.
API tests pass.
E2E tests pass.
No OPA/OpenFGA/external IAM introduced.
Existing Slice 01–06.5 flows remain green.
```

Required commands:

```bash
pnpm --filter @digital-employee/api typecheck
pnpm --filter @digital-employee/web typecheck
pnpm --filter @digital-employee/api test
pnpm --filter @digital-employee/web test:e2e
```

---

## 25. Suggested Implementation Order

```text
1. Add shared enums/types/DTOs.
2. Add DB schema and migration for workspace_member, workspace_policy, policy_decision.
3. Add default policy constants.
4. Add actor-context resolver.
5. Add permission matrix.
6. Add policy evaluator.
7. Add policy decision persistence.
8. Add policy audit writer.
9. Add policy guard and exceptions.
10. Integrate guard into workflow governance endpoints.
11. Integrate guard into proposal approval endpoints.
12. Integrate guard into deployment endpoints.
13. Integrate guard into repository/memory endpoints.
14. Add policy read APIs.
15. Add Policy page UI.
16. Add disabled button reason UI.
17. Add AuditViewer policy filters.
18. Add unit tests.
19. Add API tests.
20. Add E2E tests.
21. Run full regression suite.
```

---

## 26. Final Boundary Statement

Slice 07 succeeds if every meaningful workspace mutation can answer:

```text
Who did this?
Were they allowed?
Which policy allowed or denied it?
Where is the decision recorded?
Can the operator understand the reason?
```

Slice 07 fails if it becomes a full IAM project, introduces external policy infrastructure, or creates hidden bypasses for agent/system actions.
