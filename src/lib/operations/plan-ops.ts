import { z } from 'zod'
import { executeProjectCommand, approveProjectPlan, rejectProjectPlan } from '@/lib/command-center/executor'
import {
  getSavedSkill,
  saveWorkflowPlanTemplateFromExecutionPlan,
  SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE,
} from '@/lib/saved-skills/service'
import {
  buildWorkflowApprovalReasons,
  buildWorkflowApprovalSummary,
  buildWorkflowPlanSummary,
} from '@/lib/project-agent/presentation'
import {
  buildRunLifecycleCanonicalEvent,
  buildWorkflowApprovalCanonicalEvent,
  buildWorkflowPlanCanonicalEvent,
} from '@/lib/agent/events/workflow-events'
import type {
  ApprovalRequestPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistry } from './types'
import { writeOperationDataPart } from './types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function createPlanOperations(): ProjectAgentOperationRegistry {
  return {
    save_workflow_plan_as_skill: {
      id: 'save_workflow_plan_as_skill',
      description: 'Save an existing workflow execution plan as a reusable saved skill template.',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'project',
      inputSchema: z.object({
        planId: z.string().min(1),
        name: z.string().min(1),
        summary: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const saved = await saveWorkflowPlanTemplateFromExecutionPlan({
          userId: ctx.userId,
          projectId: ctx.projectId,
          planId: input.planId,
          name: input.name,
          summary: input.summary ?? null,
        })
        return {
          id: saved.id,
          name: saved.name,
          summary: saved.summary,
          kind: saved.kind,
          projectId: saved.projectId,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
        }
      },
    },
    create_workflow_plan_from_saved_skill: {
      id: 'create_workflow_plan_from_saved_skill',
      description: 'Create a workflow plan from a saved skill template (workflow_plan_template).',
      sideEffects: { mode: 'plan', risk: 'low' },
      scope: 'episode',
      inputSchema: z.object({
        savedSkillId: z.string().min(1),
        episodeId: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const saved = await getSavedSkill({
          userId: ctx.userId,
          savedSkillId: input.savedSkillId,
        })
        if (!saved) throw new Error('SAVED_SKILL_NOT_FOUND')
        if (saved.projectId && saved.projectId !== ctx.projectId) {
          throw new Error('SAVED_SKILL_PROJECT_MISMATCH')
        }
        if (saved.kind !== SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE) {
          throw new Error('SAVED_SKILL_KIND_UNSUPPORTED')
        }
        if (!isRecord(saved.data)) {
          throw new Error('SAVED_SKILL_DATA_INVALID')
        }
        const workflowIdRaw = normalizeString(saved.data.workflowId)
        if (workflowIdRaw !== 'story-to-script' && workflowIdRaw !== 'script-to-storyboard') {
          throw new Error('SAVED_SKILL_WORKFLOW_ID_INVALID')
        }
        const content = normalizeString(saved.data.content)
        const episodeId = normalizeString(input.episodeId)
          || normalizeString(saved.data.episodeId)
          || normalizeString(ctx.context.episodeId)
          || undefined

        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: ctx.source,
            workflowId: workflowIdRaw,
            ...(episodeId ? { episodeId } : {}),
            input: {
              ...(content ? { content } : {}),
            },
          },
        })

        const planData: WorkflowPlanPartData = {
          workflowId: workflowIdRaw,
          commandId: result.commandId,
          planId: result.planId,
          summary: buildWorkflowPlanSummary(workflowIdRaw),
          requiresApproval: result.requiresApproval,
          event: buildWorkflowPlanCanonicalEvent({
            workflowId: workflowIdRaw,
            commandId: result.commandId,
            planId: result.planId,
          }),
          steps: result.steps.map((step) => ({
            skillId: step.skillId,
            title: step.title,
          })),
        }
        writeOperationDataPart(ctx.writer, 'data-workflow-plan', planData)
        if (result.requiresApproval) {
          const approvalData: ApprovalRequestPartData = {
            workflowId: workflowIdRaw,
            commandId: result.commandId,
            planId: result.planId,
            summary: buildWorkflowApprovalSummary(workflowIdRaw),
            reasons: buildWorkflowApprovalReasons(result.steps),
            event: buildWorkflowApprovalCanonicalEvent({
              workflowId: workflowIdRaw,
              planId: result.planId,
              status: 'pending',
            }),
          }
          writeOperationDataPart(ctx.writer, 'data-approval-request', approvalData)
        } else {
          const statusData: WorkflowStatusPartData = {
            workflowId: workflowIdRaw,
            commandId: result.commandId,
            planId: result.planId,
            runId: result.linkedRunId,
            status: result.status,
            activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
            event: result.linkedRunId
              ? buildRunLifecycleCanonicalEvent({
                  workflowId: workflowIdRaw,
                  runId: result.linkedRunId,
                  status: 'start',
                })
              : null,
          }
          writeOperationDataPart(ctx.writer, 'data-workflow-status', statusData)
        }

        return {
          ...result,
          savedSkillId: saved.id,
          savedSkillName: saved.name,
        }
      },
    },
    create_workflow_plan: {
      id: 'create_workflow_plan',
      description: 'Create a persisted command and plan for a fixed workflow package.',
      sideEffects: { mode: 'plan', risk: 'low' },
      scope: 'episode',
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: ctx.source,
            workflowId: input.workflowId,
            episodeId: input.episodeId || ctx.context.episodeId || undefined,
            input: {
              ...(input.content ? { content: input.content } : {}),
            },
          },
        })
        const planData: WorkflowPlanPartData = {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          summary: buildWorkflowPlanSummary(input.workflowId),
          requiresApproval: result.requiresApproval,
          event: buildWorkflowPlanCanonicalEvent({
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
          }),
          steps: result.steps.map((step) => ({
            skillId: step.skillId,
            title: step.title,
          })),
        }
        writeOperationDataPart(ctx.writer, 'data-workflow-plan', planData)
        if (result.requiresApproval) {
          const approvalData: ApprovalRequestPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            summary: buildWorkflowApprovalSummary(input.workflowId),
            reasons: buildWorkflowApprovalReasons(result.steps),
            event: buildWorkflowApprovalCanonicalEvent({
              workflowId: input.workflowId,
              planId: result.planId,
              status: 'pending',
            }),
          }
          writeOperationDataPart(ctx.writer, 'data-approval-request', approvalData)
        } else {
          const statusData: WorkflowStatusPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            runId: result.linkedRunId,
            status: result.status,
            activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
            event: result.linkedRunId
              ? buildRunLifecycleCanonicalEvent({
                  workflowId: input.workflowId,
                  runId: result.linkedRunId,
                  status: 'start',
                })
              : null,
          }
          writeOperationDataPart(ctx.writer, 'data-workflow-status', statusData)
        }
        return result
      },
    },
    approve_plan: {
      id: 'approve_plan',
      description: 'Approve a pending workflow plan and enqueue execution.',
      sideEffects: {
        mode: 'plan',
        risk: 'high',
        billable: true,
        requiresConfirmation: true,
        longRunning: true,
        confirmationSummary: '将批准并执行 workflow plan（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'plan',
      inputSchema: z.object({
        planId: z.string().min(1),
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        confirmed: z.boolean().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const result = await approveProjectPlan({
          request: ctx.request,
          userId: ctx.userId,
          planId: input.planId,
        })
        writeOperationDataPart<WorkflowStatusPartData>(ctx.writer, 'data-workflow-status', {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          runId: result.linkedRunId,
          status: result.status,
          activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
          event: result.linkedRunId
            ? buildRunLifecycleCanonicalEvent({
                workflowId: input.workflowId,
                runId: result.linkedRunId,
                status: 'start',
              })
            : null,
        })
        return result
      },
    },
    reject_plan: {
      id: 'reject_plan',
      description: 'Reject a pending workflow plan.',
      sideEffects: { mode: 'plan', risk: 'low' },
      scope: 'plan',
      inputSchema: z.object({
        planId: z.string().min(1),
        note: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (_, input) => rejectProjectPlan({
        planId: input.planId,
        note: input.note,
      }),
    },
  }
}
