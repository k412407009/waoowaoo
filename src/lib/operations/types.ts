import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import type { ZodTypeAny, infer as ZodInfer } from 'zod'
import type { ProjectAgentContext, WorkspaceAssistantPartType } from '@/lib/project-agent/types'

export type ProjectAgentOperationId = string

export interface ProjectAgentOperationContext {
  request: NextRequest
  userId: string
  projectId: string
  context: ProjectAgentContext
  /**
   * Operation invocation source (entry semantics).
   * - assistant-panel: initiated by assistant tools in chat
   * - project-ui/api: initiated by explicit GUI/API actions
   */
  source: string
  writer?: UIMessageStreamWriter<UIMessage> | null
}

export type OperationMode = 'query' | 'act' | 'plan'

export type OperationRiskLevel = 'none' | 'low' | 'medium' | 'high'

export type OperationScope =
  | 'system'
  | 'user'
  | 'project'
  | 'episode'
  | 'storyboard'
  | 'panel'
  | 'asset'
  | 'task'
  | 'command'
  | 'plan'
  | 'mutation-batch'

export interface OperationSideEffects {
  mode: OperationMode
  risk: OperationRiskLevel
  billable?: boolean
  requiresConfirmation?: boolean
  confirmationSummary?: string
  overwrite?: boolean
  bulk?: boolean
  destructive?: boolean
  longRunning?: boolean
}

export interface ProjectAgentOperationDefinition {
  id: ProjectAgentOperationId
  description: string
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  sideEffects?: OperationSideEffects
  scope: OperationScope
  execute: (context: ProjectAgentOperationContext, input: ZodInfer<ZodTypeAny>) => Promise<unknown>
}

export type ProjectAgentOperationRegistry = Record<ProjectAgentOperationId, ProjectAgentOperationDefinition>

export function writeOperationDataPart<T>(
  writer: UIMessageStreamWriter<UIMessage> | null | undefined,
  type: WorkspaceAssistantPartType,
  data: T,
) {
  if (!writer) return
  writer.write({
    type,
    data,
  })
}
