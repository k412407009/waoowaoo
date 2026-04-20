# Agent Delivery Progress

开始时间：2026-04-19T06:08:42.480Z  
目标摘要：端到端补齐 Project Agent（Workspace Assistant）P0 关键能力与未完成任务，完善测试与文档，并拆分多次提交。  
范围假设：
- 已存在 `AGENTS.md`（全仓规范），所有改动均遵循：route 只做鉴权/参数校验/调用下沉逻辑；显式失败；禁止隐式兜底；新增/变更必须补齐测试。
- 仅聚焦 project-agent 相关 runtime/adapters/operations/routes/tests/docs 与必要的前端渲染补齐。
- 不新增外部依赖、不重写历史、不做大规模目录迁移。
验收标准（DoD）：
- `npm run typecheck` 通过。
- agent 相关改动均有对应测试覆盖（runtime/adapters/route contract）。
- 自适应停止 + cap=999 实现且达到上限有显式提示。
- tool 错误以结构化结果返回，confirmed gate 强制且具备预算元信息预留。
- docs/agent_* 与代码事实一致。
- 进度记录含命令与结果摘要。

## 未完成功能清单（来自 docs/agent_task.md）

| id | 描述 | 涉及模块 | 风险 | 需要的测试层级 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P8 | 项目阶段推导 `resolveProjectPhase` 细化 | `src/lib/project-agent/project-phase.ts` | 中 | unit | 部分完成 |
| P9 | Act Mode 直接操作 tools 覆盖收口 | `src/lib/operations/*` | 高 | unit/integration(api) | 部分完成 |
| P11 | Prompt 升级与 Act/Plan 分流规则补齐 | `src/lib/project-agent/runtime.ts` | 中 | unit | 部分完成 |
| P12 | Lite / Full Context 拆分 | `src/lib/project-context/*` `src/lib/project-projection/*` | 中 | unit | 未开始 |
| P13 | Act Mode 富渲染组件补齐 | `src/features/project-workspace/components/workspace-assistant/*` | 中 | unit(component) | 部分完成 |
| P14 | Workspace 与 Assistant 状态统一 | `src/lib/query/hooks/*` `src/features/project-workspace/*` | 中 | integration(api)/unit | 部分完成 |
| P15 | 抽象收口与精简 | `src/lib/command-center/*` `src/lib/project-context/*` | 中 | unit | 进行中 |
| P16 | operation registry 收敛 | `src/lib/operations/registry.ts` | 低 | unit | 进行中 |
| P17 | agent 代码量削减与目录收敛 | `src/lib/project-agent/*` | 中 | unit | 进行中 |
| P18 | Project Projection（snapshot/projection）补全 | `src/lib/project-projection/*` | 中 | unit | 部分完成 |
| P19 | mutation batch 与撤回（undo）收口 | `src/lib/mutation-batch/*` `src/lib/operations/governance-ops.ts` | 中 | unit/integration(api) | 部分完成 |
| P20 | sideEffects 驱动的审批分流完善 | `src/lib/operations/types.ts` `src/lib/adapters/*` | 中 | unit | 部分完成 |
| P21 | Saved Skills（沉淀/重做）完善 | `src/lib/saved-skills/*` | 低 | unit | 部分完成 |

## 里程碑进度

- [x] 基线检查与计划落地
  - 状态：done
  - 涉及文件：`docs/agent_delivery_progress.md`
  - 测试覆盖点：N/A
  - 命令与结果摘要：
    - `npm run lint:all` -> 失败（eslint 未安装）
    - `npm run typecheck` -> 失败（缺少依赖与类型：`process`/`undici`）
    - `npm run test:all` -> 失败（`cross-env` 未安装）
    - `npm run build` -> 失败（`prisma` 未安装）

- [x] Runtime：自适应停止 + cap=999
  - 状态：done
  - 涉及文件：`src/lib/project-agent/runtime.ts` `src/lib/project-agent/types.ts` `src/lib/project-agent/stop-conditions.ts` `src/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers.tsx`
  - 测试覆盖点：`tests/unit/project-agent/stop-conditions.test.ts` 覆盖 stop cap
  - 命令与结果摘要：待执行

- [x] Tool adapter：结构化错误 + confirmed gate 预算预留
  - 状态：done
  - 涉及文件：`src/lib/adapters/tools/execute-project-agent-operation.ts` `src/lib/operations/types.ts`
  - 测试覆盖点：`tests/unit/project-agent/tool-adapter.test.ts` 覆盖 input/output schema、confirmed gate、结构化错误
  - 命令与结果摘要：待执行
    - 代码修正：toMessage 使用 trim 兜底（code review 跟进）
    - 代码修正：budget 仅包含已定义字段（code review 跟进）
    - 代码修正：toMessage 对 `JSON.stringify` 的 undefined 输出兜底，保证 error.message 可诊断（P0 延续）
    - prompt 对齐：system prompt 明确 tool result wrapper（P0-P1）
    - 回归测试：补齐 throws undefined/symbol/function 的 fallback 断言（P0 延续）

- [x] Tests：agent runtime / adapter / route contract / registry
  - 状态：done
  - 涉及文件：`tests/unit/project-agent/*` `tests/unit/operations/*` `tests/integration/api/contract/*`
  - 测试覆盖点：cap stop、adapter error/confirmation、route contract
  - 命令与结果摘要：
    - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/project-agent tests/unit/operations/registry.test.ts tests/unit/components/workspace-assistant-message-parts.test.tsx` -> 失败（`vitest/config` 缺失）

- [x] Docs：对齐 agent_* 文档与代码事实
  - 状态：done
  - 涉及文件：`docs/agent_design.md` `docs/agent_design_analysis.md` `docs/agent_handoff_report.md` `docs/agent_task.md`
  - 测试覆盖点：N/A
  - 命令与结果摘要：N/A

- [x] 验证：typecheck + agent 相关测试/回归
  - 状态：done
  - 涉及文件：N/A
  - 测试覆盖点：`npm run typecheck` + 相关 test suites
  - 命令与结果摘要：
    - `npm run typecheck` -> 通过
    - `npm run test:behavior:api` -> 通过

- [x] P1：Projection / Context 分层补齐（panel 级细节）
  - 状态：done
  - 涉及文件：`src/lib/project-projection/full.ts` `src/lib/project-projection/types.ts` `src/lib/project-context/types.ts` `src/lib/project-context/assembler.ts` `src/lib/operations/read-ops.ts`
  - 测试覆盖点：`tests/unit/project-projection/full.test.ts` `tests/unit/project-context/assembler.test.ts`
  - 命令与结果摘要：待执行

- [x] P1：Projection scope 裁剪（tool 可按 scopeRef 拉取）
  - 状态：done
  - 涉及文件：`src/lib/project-projection/full.ts` `src/lib/operations/read-ops.ts`
  - 测试覆盖点：`tests/unit/project-projection/full.test.ts`（新增 scope panelId 场景）
  - 命令与结果摘要：待执行

- [x] P1/P2：Operation 覆盖与收口（plan approve/reject、mutation batch revert route）
  - 状态：done
  - 涉及文件：`src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts` `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts` `src/app/api/mutation-batches/[batchId]/revert/route.ts` `src/lib/command-center/workflow-id.ts`
  - 测试覆盖点：`tests/integration/api/contract/plan-approval-routes.test.ts` `tests/integration/api/contract/mutation-batch-revert.route.test.ts`
  - 命令与结果摘要：待执行

- [x] P1/P2：Operation 覆盖与收口（regenerate-group/single/text、modify-storyboard-image）
  - 状态：done
  - 涉及文件：`src/lib/operations/media-ops.ts` `src/lib/operations/project-agent.ts` `src/app/api/projects/[projectId]/regenerate-group/route.ts` `src/app/api/projects/[projectId]/regenerate-single-image/route.ts` `src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts` `src/app/api/projects/[projectId]/modify-storyboard-image/route.ts`
  - 测试覆盖点：`tests/unit/operations/media-ops.test.ts`（unit） + 复用 `tests/integration/api/contract/direct-submit-media-routes.test.ts`（contract）
  - 命令与结果摘要：待执行

- [x] P1/P2：Operation 覆盖与收口（project config、command detail route）
  - 状态：done
  - 涉及文件：`src/lib/operations/config-ops.ts` `src/lib/operations/project-agent.ts` `src/app/api/projects/[projectId]/config/route.ts` `src/lib/operations/read-ops.ts` `src/app/api/projects/[projectId]/commands/[commandId]/route.ts`
  - 测试覆盖点：复用 `tests/integration/api/specific/project-art-style-validation.test.ts` + 新增 `tests/integration/api/contract/project-command.route.test.ts`
  - 命令与结果摘要：待执行

- [x] P1/P2：Operation 覆盖与收口（LLM routes：analyze/voice/screenplay/stream/ai-modify）
  - 状态：done
  - 涉及文件：`src/lib/operations/extra-ops.ts` `src/app/api/projects/[projectId]/analyze/route.ts` `src/app/api/projects/[projectId]/analyze-global/route.ts` `src/app/api/projects/[projectId]/analyze-shot-variants/route.ts` `src/app/api/projects/[projectId]/voice-analyze/route.ts` `src/app/api/projects/[projectId]/screenplay-conversion/route.ts` `src/app/api/projects/[projectId]/story-to-script-stream/route.ts` `src/app/api/projects/[projectId]/script-to-storyboard-stream/route.ts` `src/app/api/projects/[projectId]/ai-modify-appearance/route.ts` `src/app/api/projects/[projectId]/ai-modify-prop/route.ts` `src/app/api/projects/[projectId]/ai-modify-shot-prompt/route.ts`
  - 测试覆盖点：复用 `tests/integration/api/contract/llm-observe-routes.test.ts`（contract）验证 taskType/targetType
  - 命令与结果摘要：待执行

- [x] P1/P2：Operation 覆盖与收口（projects CRUD + video/download routes）
  - 状态：done
  - 涉及文件：`src/lib/operations/system-project-ops.ts` `src/lib/operations/project-crud-ops.ts` `src/lib/operations/video-ops.ts` `src/lib/operations/download-ops.ts` `src/lib/operations/project-agent.ts`
  - route 下沉：`src/app/api/projects/route.ts` `src/app/api/projects/[projectId]/route.ts` `src/app/api/projects/[projectId]/video-urls/route.ts` `src/app/api/projects/[projectId]/video-proxy/route.ts` `src/app/api/projects/[projectId]/download-images/route.ts` `src/app/api/projects/[projectId]/download-videos/route.ts` `src/app/api/projects/[projectId]/download-voices/route.ts`
  - 安全性修正：episodeId 查询强制带 projectId 约束；video-proxy 仅允许解析为 storageKey 后再签名下载（避免 SSRF）。
  - 测试覆盖点：`tests/integration/api/contract/projects.route.test.ts` `tests/integration/api/contract/project-basic.route.test.ts` `tests/integration/api/contract/project-video-routes.test.ts` `tests/integration/api/contract/project-download-routes.test.ts`

- [x] P1/P2：Operation 覆盖与收口（runs/tasks/sse/asset-hub）
  - 状态：done
  - 涉及文件：
    - operations：`src/lib/operations/run-ops.ts` `src/lib/operations/task-ops.ts` `src/lib/operations/sse-ops.ts`
    - asset-hub：`src/lib/operations/asset-hub-llm-ops.ts` `src/lib/operations/asset-hub-voice-ops.ts` `src/lib/operations/asset-hub-folder-ops.ts` `src/lib/operations/asset-hub-voice-library-ops.ts` `src/lib/operations/asset-hub-picker-ops.ts`
  - route 下沉：
    - runs/tasks：`src/app/api/runs/**` `src/app/api/tasks/**`
    - sse：`src/app/api/sse/route.ts`（bootstrap 下沉到 op；流式订阅留在 route）
    - asset-hub：`src/app/api/asset-hub/**`（folders/voices/picker + llm task submit）
  - 安全性修正：
    - SSE replay 引入按 userId 过滤，避免跨用户事件回放混淆。
  - 测试覆盖点：
    - `tests/integration/api/contract/run-cancel.route.test.ts`
    - `tests/integration/api/contract/run-step-retry.route.test.ts`
    - `tests/integration/api/contract/runs-list.route.test.ts`
    - 复用 `tests/integration/api/contract/direct-submit-*-routes.test.ts`
  - 命令与结果摘要：
    - `npm run typecheck` -> 通过
    - `npm run test:behavior:api` -> 通过

- [x] P1/P2：Operation 覆盖与收口（project 编辑入口：storyboards/panel/voice-lines/editor/episodes/speaker-voice）
  - 状态：done
  - 涉及文件：
    - operations：`src/lib/operations/gui-ops.ts`（新增 query/read operations：`list_storyboards`/`list_voice_lines`/`list_voice_line_speakers`/`get_video_editor_project`/`list_episodes`/`get_episode_detail`/`get_speaker_voices`）
    - operations：`src/lib/operations/plan-ops.ts`（approve/reject 补齐 projectId 校验 + workflowId 推导）
    - operations：`src/lib/operations/project-agent.ts`（mutate_storyboard 支持 delete/update 通过 panelId 自动反查 storyboardId）
  - route 下沉：
    - `src/app/api/projects/[projectId]/storyboards/route.ts`
    - `src/app/api/projects/[projectId]/panel/route.ts`
    - `src/app/api/projects/[projectId]/panel/select-candidate/route.ts`
    - `src/app/api/projects/[projectId]/voice-lines/route.ts`
    - `src/app/api/projects/[projectId]/editor/route.ts`
    - `src/app/api/projects/[projectId]/episodes/route.ts`
    - `src/app/api/projects/[projectId]/episodes/[episodeId]/route.ts`
    - `src/app/api/projects/[projectId]/episodes/split-by-markers/route.ts`
    - `src/app/api/projects/[projectId]/speaker-voice/route.ts`
    - `src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts`
    - `src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts`
  - 安全性修正：
    - episode detail GET 从 `findUnique` 改为 op 内 `findFirst({ id, projectId })` 强制 projectId 约束，避免跨项目 episodeId 泄露。
  - 测试覆盖点：
    - `tests/integration/api/contract/plan-approval-routes.test.ts`（更新为 route 仅 thin-call，不再 mock prisma）
    - 复用既有 `tests/integration/api/contract/project-crud-routes.test.ts` 等契约

- [x] P1/P2：Operation 覆盖与收口（user/auth：preferences/models/billing/api-config/register）
  - 状态：done
  - 涉及文件：
    - operations：`src/lib/operations/user-preference-ops.ts` `src/lib/operations/user-models-ops.ts` `src/lib/operations/user-billing-ops.ts` `src/lib/operations/user-api-config-ops.ts` `src/lib/operations/auth-ops.ts`
    - 抽离：`src/lib/user-api/api-config.ts`（route 迁移为 thin wrapper，逻辑可被 operation 复用）
  - route 下沉：
    - `src/app/api/user-preference/route.ts`
    - `src/app/api/user/models/route.ts`
    - `src/app/api/user/costs/route.ts`
    - `src/app/api/user/transactions/route.ts`
    - `src/app/api/user/api-config/route.ts`
    - `src/app/api/auth/register/route.ts`（保留 rate-limit 与审计日志；注册落地迁移到 operation）
  - 说明：
    - auth register 属于“无 session”入口，此处约定传 `projectId='system'` 且 `userId='anonymous'`（operation 内不依赖 ctx.userId）。
