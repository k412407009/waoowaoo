import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

type LegacyProjectCharacterSelectBody = {
  characterId?: string
  appearanceId?: string
  selectedIndex?: number | null
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyProjectCharacterSelectBody
  if (typeof body.characterId !== 'string' || body.characterId.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'select_asset_render',
    projectId,
    userId: authResult.session.user.id,
    input: {
      type: 'character',
      assetId: body.characterId,
      ...(typeof body.appearanceId === 'string' ? { appearanceId: body.appearanceId } : {}),
      ...(body.selectedIndex !== undefined ? { imageIndex: body.selectedIndex ?? null } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
