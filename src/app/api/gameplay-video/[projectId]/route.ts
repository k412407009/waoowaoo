import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { loadGameplayVideoProject } from '@/lib/gameplay-video/service'

export const GET = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const gameplayVideoData = await loadGameplayVideoProject(projectId)

  return NextResponse.json({
    project: {
      id: authResult.project.id,
      name: authResult.project.name,
      description: typeof authResult.project.description === 'string' ? authResult.project.description : null,
    },
    gameplayVideoData,
  })
})
