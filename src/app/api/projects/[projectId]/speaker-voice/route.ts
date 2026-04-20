import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value.length > 0 ? value : null
}

/**
 * GET /api/projects/[projectId]/speaker-voice?episodeId=xxx
 * 获取剧集的发言人音色配置
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_speaker_voices',
    projectId,
    userId: authResult.session.user.id,
    input: { episodeId },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})

/**
 * PATCH /api/projects/[projectId]/speaker-voice
 * 为指定发言人直接设置音色（写入 episode.speakerVoices JSON）
 * 用于不在资产库中的角色在配音阶段内联绑定音色
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const episodeId = readTrimmedString(body?.episodeId) ?? ''
  const speaker = readTrimmedString(body?.speaker) ?? ''
  const voiceType = readTrimmedString(body?.voiceType) ?? 'uploaded'
  const providerRaw = readTrimmedString(body?.provider)?.toLowerCase() ?? null
  if (!providerRaw || (providerRaw !== 'fal' && providerRaw !== 'bailian')) {
    throw new ApiError('INVALID_PARAMS')
  }
  const provider = providerRaw
  const audioUrl = readTrimmedString(body?.audioUrl)
  const previewAudioUrl = readTrimmedString(body?.previewAudioUrl)
  const voiceId = readTrimmedString(body?.voiceId)

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!speaker) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (provider === 'fal' && !audioUrl) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (provider === 'bailian' && !voiceId) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'set_speaker_voice',
    projectId,
    userId: authResult.session.user.id,
    input: {
      episodeId,
      speaker,
      provider,
      voiceType,
      ...(audioUrl ? { audioUrl } : {}),
      ...(previewAudioUrl ? { previewAudioUrl } : {}),
      ...(voiceId ? { voiceId } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
