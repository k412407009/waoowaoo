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

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const note = typeof (body as { note?: unknown }).note === 'string'
    ? ((body as { note: string }).note.trim() || undefined)
    : undefined
  if (note !== undefined && note.length > 5000) {
    throw new ApiError('INVALID_PARAMS', {
      field: 'note',
      message: 'note is too long',
    })
  }

  const raw = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'reject_plan',
    projectId,
    userId: authResult.session.user.id,
    input: {
      planId: resolvedPlanId,
      ...(note ? { note } : {}),
    },
    source: 'project-ui/api',
  })

  const result = (() => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'REJECT_PLAN_RESULT_INVALID',
        message: 'reject_plan result must be an object',
      })
    }
    return raw as Record<string, unknown>
  })()

  const requireString = (value: unknown, field: string): string => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'REJECT_PLAN_RESULT_INVALID',
        message: `reject_plan result missing ${field}`,
      })
    }
    return normalized
  }

  const steps = (() => {
    if (!Array.isArray(result.steps)) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'REJECT_PLAN_RESULT_INVALID',
        message: 'reject_plan result missing steps',
      })
    }
    return result.steps
  })()

  return NextResponse.json({
    success: true,
    commandId: requireString(result.commandId, 'commandId'),
    planId: requireString(result.planId, 'planId'),
    status: requireString(result.status, 'status'),
    summary: typeof result.summary === 'string' ? result.summary : null,
    steps,
  })
})
