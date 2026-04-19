import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { characterId, appearanceId, newDescription, descriptionIndex } = body

  if (!characterId || !appearanceId || !newDescription) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_character_appearance_description',
    projectId,
    userId: authResult.session.user.id,
    input: {
      characterId,
      appearanceId,
      newDescription,
      ...(descriptionIndex !== undefined ? { descriptionIndex } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
