import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const storyboardId = body?.storyboardId
  const panelIndex = body?.panelIndex
  const voiceLineId = body?.voiceLineId

  if (!storyboardId || panelIndex === undefined || !voiceLineId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const lipSyncModel = typeof body?.lipSyncModel === 'string' ? body.lipSyncModel.trim() : undefined

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'lip_sync',
    projectId,
    userId: authResult.session.user.id,
    input: {
      storyboardId,
      panelIndex: Number(panelIndex),
      voiceLineId,
      ...(lipSyncModel ? { lipSyncModel } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
