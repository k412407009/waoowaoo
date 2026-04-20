import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; planId: string }> },
) => {
  const { projectId, planId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const resolvedPlanId = planId.trim()
  if (!resolvedPlanId) {
    throw new ApiError('INVALID_PARAMS', { field: 'planId', message: 'planId is required' })
  }

  const raw = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'approve_plan',
    projectId,
    userId: authResult.session.user.id,
    input: {
      planId: resolvedPlanId,
    },
    source: 'project-ui/api',
  })

  const result = (() => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'APPROVE_PLAN_RESULT_INVALID',
        message: 'approve_plan result must be an object',
      })
    }
    return raw as Record<string, unknown>
  })()

  const requireString = (value: unknown, field: string): string => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'APPROVE_PLAN_RESULT_INVALID',
        message: `approve_plan result missing ${field}`,
      })
    }
    return normalized
  }

  const readStringOrNull = (value: unknown): string | null => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized ? normalized : null
  }

  const steps = (() => {
    if (!Array.isArray(result.steps)) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'APPROVE_PLAN_RESULT_INVALID',
        message: 'approve_plan result missing steps',
      })
    }
    return result.steps
  })()

  return NextResponse.json({
    success: true,
    async: true,
    commandId: requireString(result.commandId, 'commandId'),
    planId: requireString(result.planId, 'planId'),
    taskId: readStringOrNull(result.linkedTaskId),
    runId: readStringOrNull(result.linkedRunId),
    status: requireString(result.status, 'status'),
    summary: typeof result.summary === 'string' ? result.summary : null,
    steps,
  })
})
