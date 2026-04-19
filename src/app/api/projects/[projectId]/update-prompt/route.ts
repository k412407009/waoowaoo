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

  const { shotId, field, value } = await request.json()

  // 验证字段
  if (field !== 'imagePrompt' && field !== 'videoPrompt') {
    throw new ApiError('INVALID_PARAMS')
  }

  const updatedShot = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_shot_prompt',
    projectId,
    userId: authResult.session.user.id,
    input: {
      shotId,
      field,
      value,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true, shot: updatedShot })
})
