import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { loadGameplayEditorProject, loadGameplayVideoProject, markGameplayRenderPending } from '@/lib/gameplay-video/service'
import { prisma } from '@/lib/prisma'
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
  const editor = await loadGameplayEditorProject(projectId)

  const renderVersion = await prisma.gameplayRenderVersion.create({
    data: {
      gameplayVideoProjectId: gameplayVideoData.id,
      editorProjectId: editor.record.id,
      language: typeof body?.language === 'string' ? body.language.trim() : gameplayVideoData.language,
      aspectRatio: typeof body?.aspectRatio === 'string' ? body.aspectRatio.trim() : gameplayVideoData.aspectRatio,
      status: 'pending',
    },
  })

  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_RENDER,
    targetType: 'GameplayRenderVersion',
    targetId: renderVersion.id,
    payload: {
      renderVersionId: renderVersion.id,
      editorProjectId: editor.record.id,
    },
  })

  await markGameplayRenderPending(projectId, renderVersion.id, result.taskId)

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
    renderVersionId: renderVersion.id,
  })
})
