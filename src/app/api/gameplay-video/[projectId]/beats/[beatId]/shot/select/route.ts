import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { selectGameplayShot } from '@/lib/gameplay-video/service'

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; beatId: string }> },
) => {
  const { projectId, beatId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const shotId = typeof body?.shotId === 'string' ? body.shotId.trim() : ''
  if (!shotId) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'shotId is required',
    })
  }

  const gameplayVideoData = await selectGameplayShot(projectId, beatId, shotId)
  return NextResponse.json({
    success: true,
    gameplayVideoData,
  })
})
