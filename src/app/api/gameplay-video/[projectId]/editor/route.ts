import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import {
  loadGameplayEditorProject,
  saveGameplayEditorProject,
  serializeGameplayVideoProject,
  loadGameplayVideoProject,
} from '@/lib/gameplay-video/service'
import { prisma } from '@/lib/prisma'

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { record, projectData } = await loadGameplayEditorProject(projectId)
  const gameplayVideoData = await loadGameplayVideoProject(projectId)
  return NextResponse.json({
    id: record.id,
    gameplayVideoProjectId: record.gameplayVideoProjectId,
    projectData,
    renderStatus: record.renderStatus,
    renderTaskId: record.renderTaskId,
    outputUrl: gameplayVideoData.editorProject?.outputUrl || null,
    updatedAt: record.updatedAt,
  })
})

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  if (!body?.projectData) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'projectData is required',
    })
  }

  const record = await saveGameplayEditorProject(projectId, body.projectData)
  const refreshed = await prisma.gameplayVideoProject.findUnique({
    where: { projectId },
    include: {
      brief: true,
      references: { include: { imageMedia: true }, orderBy: { createdAt: 'asc' } },
      beats: {
        orderBy: { orderIndex: 'asc' },
        include: {
          keyframes: { include: { imageMedia: true }, orderBy: { createdAt: 'asc' } },
          shots: { include: { videoMedia: true }, orderBy: { variantIndex: 'asc' } },
          voiceoverAudioMedia: true,
        },
      },
      editorProject: { include: { outputMedia: true } },
      renderVersions: { include: { outputMedia: true }, orderBy: { createdAt: 'desc' } },
    },
  })

  return NextResponse.json({
    success: true,
    id: record.id,
    updatedAt: record.updatedAt,
    ...(refreshed ? { gameplayVideoData: serializeGameplayVideoProject(refreshed) } : {}),
  })
})
