import { describe, expect, it } from 'vitest'
import { buildExecutionPlanDraft } from '@/lib/command-center/plan-builder'
import { normalizeCommandEnvelope, resolvePlanApprovalRequirement } from '@/lib/command-center/executor'

describe('command-center approval routing', () => {
  it('gui workflow packages bypass approval for direct main-flow execution', () => {
    const command = normalizeCommandEnvelope({
      projectId: 'project-1',
      body: {
        commandType: 'run_workflow_package',
        source: 'gui',
        workflowId: 'story-to-script',
        episodeId: 'episode-1',
        input: {
          content: 'story text',
        },
      },
    })
    const plan = buildExecutionPlanDraft(command)

    expect(plan.requiresApproval).toBe(true)
    expect(resolvePlanApprovalRequirement(command, plan)).toBe(false)
  })

  it('assistant-panel workflow packages keep explicit approval', () => {
    const command = normalizeCommandEnvelope({
      projectId: 'project-1',
      body: {
        commandType: 'run_workflow_package',
        source: 'assistant-panel',
        workflowId: 'story-to-script',
        episodeId: 'episode-1',
        input: {
          content: 'story text',
        },
      },
    })
    const plan = buildExecutionPlanDraft(command)

    expect(resolvePlanApprovalRequirement(command, plan)).toBe(true)
  })

  it('run_skill commands keep baseline approval behavior', () => {
    const command = normalizeCommandEnvelope({
      projectId: 'project-1',
      body: {
        commandType: 'run_skill',
        source: 'gui',
        skillId: 'panel_variant',
        episodeId: 'episode-1',
        scopeRef: 'panel:panel-1',
        input: {
          panelId: 'panel-1',
        },
      },
    })
    const plan = buildExecutionPlanDraft(command)

    expect(resolvePlanApprovalRequirement(command, plan)).toBe(false)
  })
})
