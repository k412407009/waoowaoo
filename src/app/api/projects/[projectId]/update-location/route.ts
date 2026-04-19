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
  const { locationId, imageIndex = 0, newDescription } = body

  if (!locationId || !newDescription) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_location_image_description',
    projectId,
    userId: authResult.session.user.id,
    input: {
      locationId,
      imageIndex,
      newDescription,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
