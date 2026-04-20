import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) => {
  const { batchId } = await context.params
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const resolvedBatchId = batchId.trim()
  if (!resolvedBatchId) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MUTATION_BATCH_ID_REQUIRED',
      field: 'batchId',
      message: 'batchId is required',
    })
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'revert_mutation_batch_by_id',
    projectId: 'system',
    userId: session.user.id,
    input: {
      batchId: resolvedBatchId,
    },
    source: 'project-ui/api',
  })

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('REVERT_MUTATION_BATCH_RESULT_INVALID')
  }
  const record = result as Record<string, unknown>
  if (typeof record.ok !== 'boolean') {
    throw new Error('REVERT_MUTATION_BATCH_RESULT_INVALID')
  }
  if (typeof record.reverted !== 'number') {
    throw new Error('REVERT_MUTATION_BATCH_RESULT_INVALID')
  }

  return NextResponse.json({
    ok: record.ok,
    reverted: record.reverted,
    ...(record.ok ? {} : { error: record.error }),
  })
})
