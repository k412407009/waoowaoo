import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { loadGameplayVideoProject } from '@/lib/gameplay-video/service'
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
  const locale = resolveRequiredTaskLocale(request, body)
  const gameplayVideoData = await loadGameplayVideoProject(projectId)

  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_BEATS_GENERATE,
    targetType: 'GameplayVideoProject',
    targetId: gameplayVideoData.id,
    payload: {
      analysisModel: typeof body?.analysisModel === 'string' ? body.analysisModel.trim() : gameplayVideoData.analysisModel,
    },
  })

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
  })
})
