import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
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
  const variantCount = typeof body?.variantCount === 'number'
    ? Math.max(1, Math.min(3, Math.floor(body.variantCount)))
    : 1

  const beat = await prisma.gameplayBeat.findUnique({
    where: { id: beatId },
    include: {
      shots: true,
      project: true,
    },
  })
  if (!beat || beat.project.projectId !== projectId) {
    throw new ApiError('NOT_FOUND')
  }

  const nextVariantIndex = beat.shots.reduce((max, shot) => Math.max(max, shot.variantIndex), -1) + 1
  const createdShots = []
  for (let index = 0; index < variantCount; index += 1) {
    const shot = await prisma.gameplayShot.create({
      data: {
        beatId,
        variantIndex: nextVariantIndex + index,
        mode: typeof body?.generationMode === 'string' ? body.generationMode.trim() : beat.generationMode,
        status: 'queued',
      },
    })
    createdShots.push(shot)
  }

  const result = await submitTask({
    userId: authResult.session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.GAMEPLAY_SHOT_GENERATE,
    targetType: 'GameplayBeat',
    targetId: beatId,
    payload: {
      beatId,
      shotIds: createdShots.map((shot) => shot.id),
      variantCount,
      imageModel: typeof body?.imageModel === 'string' ? body.imageModel.trim() : null,
      videoModel: typeof body?.videoModel === 'string' ? body.videoModel.trim() : null,
      generationMode: typeof body?.generationMode === 'string' ? body.generationMode.trim() : null,
    },
  })

  return NextResponse.json({
    success: true,
    async: true,
    taskId: result.taskId,
    beatId,
    shotIds: createdShots.map((shot) => shot.id),
  })
})
