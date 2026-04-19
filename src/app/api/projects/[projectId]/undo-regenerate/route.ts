import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

type LegacyProjectRevertBody = Record<string, unknown> & {
  type?: 'character' | 'location'
  id?: string
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyProjectRevertBody
  if ((body.type !== 'character' && body.type !== 'location') || typeof body.id !== 'string' || body.id.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'revert_asset_render',
    projectId,
    userId: authResult.session.user.id,
    input: body,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
