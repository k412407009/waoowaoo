import { z } from 'zod'
import { queryTaskTargetStates } from '@/lib/task/state-service'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { executeProjectCommand, approveProjectPlan, listProjectCommands, rejectProjectPlan } from '@/lib/command-center/executor'
import { listSkillCatalogEntries, listWorkflowPackages } from '@/lib/skill-system/catalog'
import { loadScriptPreview, loadStoryboardPreview } from '@/lib/project-agent/preview'
import { resolveProjectPhase } from '@/lib/project-agent/project-phase'
import {
  buildAssistantProjectContextSnapshot,
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
  ProjectContextPartData,
  ProjectPhasePartData,
  ScriptPreviewPartData,
  StoryboardPreviewPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistry } from './types'
import { writeOperationDataPart } from './types'

const taskTargetSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  types: z.array(z.string().min(1)).optional(),
})

export function createProjectAgentOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    get_project_phase: {
      description: 'Resolve the current project phase, progress and available next actions.',
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const snapshot = await resolveProjectPhase({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectPhasePartData>(ctx.writer, 'data-project-phase', {
          phase: snapshot.phase,
          snapshot,
        })
        return snapshot
      },
    },
    get_project_context: {
      description: 'Load the current project and episode context snapshot.',
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const projectContext = await assembleProjectContext({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectContextPartData>(ctx.writer, 'data-project-context', {
          context: buildAssistantProjectContextSnapshot(projectContext),
        })
        return buildAssistantProjectContextSnapshot(projectContext)
      },
    },
    list_workflow_packages: {
      description: 'List available workflow packages and skill catalog entries.',
      inputSchema: z.object({}),
      execute: async () => ({
        workflows: listWorkflowPackages().map((workflowPackage) => ({
          id: workflowPackage.manifest.id,
          name: workflowPackage.manifest.name,
          summary: workflowPackage.manifest.summary,
          requiresApproval: workflowPackage.manifest.requiresApproval,
          skills: workflowPackage.steps.map((step) => step.skillId),
        })),
        catalog: listSkillCatalogEntries(),
      }),
    },
    create_workflow_plan: {
      description: 'Create a persisted command and plan for a fixed workflow package.',
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: 'assistant-panel',
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
      description: 'Approve a pending workflow plan and enqueue execution.',
      inputSchema: z.object({
        planId: z.string().min(1),
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
      }),
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
      description: 'Reject a pending workflow plan.',
      inputSchema: z.object({
        planId: z.string().min(1),
        note: z.string().optional(),
      }),
      execute: async (_, input) => rejectProjectPlan({
        planId: input.planId,
        note: input.note,
      }),
    },
    list_recent_commands: {
      description: 'List recent command and run status for the current project or episode.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (ctx, input) =>
        listProjectCommands({
          projectId: ctx.projectId,
          episodeId: ctx.context.episodeId || null,
          limit: input.limit || 10,
        }),
    },
    fetch_workflow_preview: {
      description: 'Load a rendered preview for the latest workflow artifacts.',
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const resolvedEpisodeId = input.episodeId || ctx.context.episodeId || ''
        if (!resolvedEpisodeId) {
          throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
        }
        if (input.workflowId === 'story-to-script') {
          const preview = await loadScriptPreview({ episodeId: resolvedEpisodeId })
          writeOperationDataPart<ScriptPreviewPartData>(ctx.writer, 'data-script-preview', preview)
          return preview
        }
        const preview = await loadStoryboardPreview({ episodeId: resolvedEpisodeId })
        writeOperationDataPart<StoryboardPreviewPartData>(ctx.writer, 'data-storyboard-preview', preview)
        return preview
      },
    },
    get_task_status: {
      description: 'Query task target states for one or more project targets.',
      inputSchema: z.object({
        targets: z.array(taskTargetSchema).min(1).max(50),
      }),
      execute: async (ctx, input) => ({
        states: await queryTaskTargetStates({
          projectId: ctx.projectId,
          userId: ctx.userId,
          targets: input.targets,
        }),
      }),
    },
  }
}
