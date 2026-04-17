import { describe, expect, it } from 'vitest'
import { buildExecutionPlanDraft } from '@/lib/command-center/plan-builder'
import { normalizeCommandEnvelope } from '@/lib/command-center/executor'

describe('command-center plan builder', () => {
  it('story-to-script workflow package -> expands ordered workflow skills', () => {
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

    expect(plan.summary).toContain('screenplay')
    expect(plan.steps.map((step) => step.skillId)).toEqual([
      'analyze-characters',
      'analyze-locations',
      'analyze-props',
      'split-clips',
      'generate-screenplay',
    ])
    expect(plan.requiresApproval).toBe(true)
    expect(plan.steps[3]?.dependsOn).toEqual(['analyze-props'])
    expect(plan.steps[4]?.inputArtifacts).toContain('clip.split')
  })

  it('run_skill panel_variant -> builds single-step plan', () => {
    const command = normalizeCommandEnvelope({
      projectId: 'project-1',
      body: {
        commandType: 'run_skill',
        source: 'assistant-panel',
        skillId: 'panel_variant',
        episodeId: 'episode-1',
        scopeRef: 'panel:panel-1',
        input: {
          panelId: 'panel-1',
        },
      },
    })

    const plan = buildExecutionPlanDraft(command)

    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({
      skillId: 'panel_variant',
      mutationKind: 'generate',
      requiresApproval: false,
    })
    expect(plan.steps[0]?.outputArtifacts).toEqual(['panel.image'])
  })
})
