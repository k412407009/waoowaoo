import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const beatId = typeof body?.beatId === 'string' ? body.beatId.trim() : ''
  if (!beatId) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'beatId is required',
    })
  }

  const locale = resolveRequiredTaskLocale(request, body)
  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_UI_COMPOSE,
    targetType: 'GameplayBeat',
    targetId: beatId,
    payload: { beatId },
  })

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
    beatId,
  })
})
