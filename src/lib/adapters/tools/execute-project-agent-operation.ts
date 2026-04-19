import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'
import { writeOperationDataPart, type OperationSideEffects } from '@/lib/operations/types'
import type { ConfirmationRequestPartData, ProjectAgentContext } from '@/lib/project-agent/types'

function shouldRequireAssistantConfirmation(sideEffects: OperationSideEffects | undefined): boolean {
  if (!sideEffects) return false
  if (sideEffects.requiresConfirmation !== undefined) return sideEffects.requiresConfirmation
  if (sideEffects.mode === 'query') return false
  if (sideEffects.billable) return true
  if (sideEffects.risk === 'high' || sideEffects.risk === 'medium') return true
  if (sideEffects.destructive || sideEffects.overwrite || sideEffects.bulk || sideEffects.longRunning) return true
  return false
}

export async function executeProjectAgentOperationFromTool(params: {
  request: NextRequest
  operationId: string
  projectId: string
  userId: string
  context: ProjectAgentContext
  source: string
  writer: UIMessageStreamWriter<UIMessage>
  input: unknown
}) {
  const registry = createProjectAgentOperationRegistry()
  const operation = registry[params.operationId]
  if (!operation) {
    throw new Error(`operation not found: ${params.operationId}`)
  }

  const parsed = operation.inputSchema.safeParse(params.input)
  if (!parsed.success) {
    const error = new Error('PROJECT_AGENT_INVALID_OPERATION_INPUT')
    ;(error as Error & { issues?: unknown }).issues = parsed.error.issues
    throw error
  }

  const requiresConfirmation = shouldRequireAssistantConfirmation(operation.sideEffects)
  if (requiresConfirmation) {
    const confirmed = !!(
      parsed.data
      && typeof parsed.data === 'object'
      && (parsed.data as { confirmed?: unknown }).confirmed === true
    )
    if (!confirmed) {
      writeOperationDataPart<ConfirmationRequestPartData>(params.writer, 'data-confirmation-request', {
        operationId: params.operationId,
        summary: operation.sideEffects?.confirmationSummary
          || `执行 ${params.operationId} 会产生写入或计费副作用。请在确认后重试，并在参数中带 confirmed=true。`,
        argsHint: {
          ...(parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data as Record<string, unknown> : {}),
          confirmed: true,
        },
      })
      return {
        confirmationRequired: true,
        operationId: params.operationId,
      }
    }
  }

  const result = await operation.execute({
    request: params.request,
    userId: params.userId,
    projectId: params.projectId,
    context: params.context,
    source: params.source,
    writer: params.writer,
  }, parsed.data)
  const outputParsed = operation.outputSchema.safeParse(result)
  if (!outputParsed.success) {
    const error = new Error('PROJECT_AGENT_OPERATION_OUTPUT_INVALID')
    ;(error as Error & { issues?: unknown }).issues = outputParsed.error.issues
    throw error
  }
  return outputParsed.data
}
