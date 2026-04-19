import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const locationId = typeof body?.locationId === 'string' ? body.locationId.trim() : ''
  const imageIndexValue = Number(body?.imageIndex ?? 0)
  const imageIndex = Number.isFinite(imageIndexValue) ? Math.max(0, Math.floor(imageIndexValue)) : 0
  const currentDescription = typeof body?.currentDescription === 'string' ? body.currentDescription.trim() : ''
  const modifyInstruction = typeof body?.modifyInstruction === 'string' ? body.modifyInstruction.trim() : ''

  if (!locationId || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'ai_modify_location',
    projectId,
    userId: session.user.id,
    input: {
      ...(body as Record<string, unknown>),
      locationId,
      imageIndex,
      currentDescription,
      modifyInstruction,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
