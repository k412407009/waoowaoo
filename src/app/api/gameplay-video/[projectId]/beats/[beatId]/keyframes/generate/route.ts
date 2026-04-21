import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; beatId: string }> },
) => {
  const { projectId, beatId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const locale = resolveRequiredTaskLocale(request, body)
  const kinds = Array.isArray(body?.kinds)
    ? body.kinds.filter((kind: unknown): kind is string => typeof kind === 'string' && kind.trim().length > 0)
    : ['first', 'last']

  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_KEYFRAME_GENERATE,
    targetType: 'GameplayBeat',
    targetId: beatId,
    payload: {
      beatId,
      kinds,
      imageModel: typeof body?.imageModel === 'string' ? body.imageModel.trim() : null,
    },
  })

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
    beatId,
  })
})
