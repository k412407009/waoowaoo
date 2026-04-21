import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { loadGameplayVideoProject } from '@/lib/gameplay-video/service'

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) => {
  const { projectId, id } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const gameplayVideoData = await loadGameplayVideoProject(projectId)
  const renderVersion = gameplayVideoData.renderVersions.find((item) => item.id === id)
  if (!renderVersion) {
    throw new ApiError('NOT_FOUND')
  }

  return NextResponse.json({
    renderVersion,
  })
})
