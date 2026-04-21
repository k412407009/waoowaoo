import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { upsertGameplayBrief } from '@/lib/gameplay-video/service'

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return normalized.length > 0 ? normalized : null
}

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const script = typeof body?.script === 'string' ? body.script.trim() : ''
  if (!script) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'script is required',
    })
  }

  const gameplayVideoData = await upsertGameplayBrief({
    projectId,
    script,
    sellingPoints: readStringArray(body?.sellingPoints),
    coreLoop: typeof body?.coreLoop === 'string' ? body.coreLoop.trim() : null,
    targetAudience: typeof body?.targetAudience === 'string' ? body.targetAudience.trim() : null,
    platforms: readStringArray(body?.platforms),
    cta: typeof body?.cta === 'string' ? body.cta.trim() : null,
    notes: typeof body?.notes === 'string' ? body.notes.trim() : null,
    targetDurationSec: typeof body?.targetDurationSec === 'number' ? body.targetDurationSec : null,
    visualStyle: typeof body?.visualStyle === 'string' ? body.visualStyle.trim() : null,
    uiStyle: typeof body?.uiStyle === 'string' ? body.uiStyle.trim() : null,
    narratorVoice: typeof body?.narratorVoice === 'string' ? body.narratorVoice.trim() : null,
    analysisModel: typeof body?.analysisModel === 'string' ? body.analysisModel.trim() : null,
    imageModel: typeof body?.imageModel === 'string' ? body.imageModel.trim() : null,
    videoModel: typeof body?.videoModel === 'string' ? body.videoModel.trim() : null,
    audioModel: typeof body?.audioModel === 'string' ? body.audioModel.trim() : null,
    aspectRatio: typeof body?.aspectRatio === 'string' ? body.aspectRatio.trim() : null,
    language: typeof body?.language === 'string' ? body.language.trim() : null,
    endSlateConfig: body?.endSlateConfig || null,
  })

  return NextResponse.json({
    success: true,
    gameplayVideoData,
  })
})
