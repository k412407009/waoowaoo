import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, getRequestId } from '@/lib/api-errors'
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
  const locale = resolveRequiredTaskLocale(request, body)
  const beatIds = Array.isArray(body?.beatIds)
    ? body.beatIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    : []

  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_VOICEOVER_GENERATE,
    targetType: beatIds.length === 1 ? 'GameplayBeat' : 'GameplayVideoProject',
    targetId: beatIds.length === 1 ? beatIds[0] : projectId,
    payload: {
      beatIds,
      narratorVoice: typeof body?.narratorVoice === 'string' ? body.narratorVoice.trim() : null,
      audioModel: typeof body?.audioModel === 'string' ? body.audioModel.trim() : null,
    },
  })

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
  })
})
